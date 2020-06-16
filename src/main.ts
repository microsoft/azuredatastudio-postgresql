/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { SqlOpsDataClient, ClientOptions } from 'dataprotocol-client';
import { IConfig, ServerProvider, Events } from 'service-downloader';
import { ServerOptions, TransportKind } from 'vscode-languageclient';
import * as nls from 'vscode-nls';

// this should precede local imports because they can trigger localization calls
const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

import registerCommands from './commands';
import * as Constants from './constants';
import ContextProvider from './contextProvider';
import * as Utils from './utils';
import * as Helper from './commonHelper';
import { Telemetry, LanguageClientErrorHandler } from './telemetry';
import { CommandObserver } from './commandObserver';
import { NotificationType } from 'vscode-languageclient';

const baseConfig = require('./config.json');
const outputChannel = vscode.window.createOutputChannel(Constants.serviceName);
const statusView = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

export async function activate(context: vscode.ExtensionContext) {
	// lets make sure we support this platform first
	let supported = await Utils.verifyPlatform();

	if (!supported) {
		vscode.window.showErrorMessage('Unsupported platform');
		return;
	}

	let config: IConfig = JSON.parse(JSON.stringify(baseConfig));
	config.installDirectory = path.join(__dirname, config.installDirectory);
	config.proxy = vscode.workspace.getConfiguration('http').get('proxy');
	config.strictSSL = vscode.workspace.getConfiguration('http').get('proxyStrictSSL') || true;

	let languageClient: SqlOpsDataClient;

	const serverdownloader = new ServerProvider(config);

	serverdownloader.eventEmitter.onAny(generateHandleServerProviderEvent());

	let clientOptions: ClientOptions = {
		providerId: Constants.providerId,
		errorHandler: new LanguageClientErrorHandler(),
		documentSelector: ['sql'],
		synchronize: {
			configurationSection: 'pgsql'
		},
	};

	let packageInfo = Utils.getPackageInfo();
	let commandObserver = new CommandObserver();
	const installationStart = Date.now();
	serverdownloader.getOrDownloadServer().then(e => {
		const installationComplete = Date.now();
		let serverOptions = generateServerOptions(e);
        languageClient = new SqlOpsDataClient(Constants.serviceName, serverOptions, clientOptions);
        for (let command of registerCommands(commandObserver, packageInfo, languageClient)) {
            context.subscriptions.push(command);
        }
        const processStart = Date.now();
        languageClient.onReady().then(() => {
            const processEnd = Date.now();
            statusView.text = 'Pgsql service started';
            setTimeout(() => {
                statusView.hide();
            }, 1500);
            Telemetry.sendTelemetryEvent('startup/LanguageClientStarted', {
                installationTime: String(installationComplete - installationStart),
                processStartupTime: String(processEnd - processStart),
                totalTime: String(processEnd - installationStart),
                beginningTimestamp: String(installationStart)
            });
            addDeployNotificationsHandler(languageClient, commandObserver);
		});
		statusView.show();
		statusView.text = 'Starting pgsql service';
		languageClient.start();
	}, _e => {
		Telemetry.sendTelemetryEvent('ServiceInitializingFailed');
		vscode.window.showErrorMessage('Failed to start Pgsql tools service');
	});

	let contextProvider = new ContextProvider();
	context.subscriptions.push(contextProvider);

	try {
		var pgProjects = await vscode.workspace.findFiles('{**/*.pgproj}');
		if (pgProjects.length > 0) {
			await Helper.checkProjectVersion(
				packageInfo.minSupportedPostgreSQLProjectSDK,
				packageInfo.maxSupportedPostgreSQLProjectSDK,
				pgProjects.map(p => p.fsPath),
				commandObserver);
		}
	} catch (err) {
		outputChannel.appendLine(`Failed to verify project SDK, error: ${err}`);
	}

	context.subscriptions.push({ dispose: () => languageClient.stop() });
}

function addDeployNotificationsHandler(client: SqlOpsDataClient, commandObserver: CommandObserver) {
    const queryCompleteType: NotificationType<string, any> = new NotificationType('query/deployComplete');
	client.onNotification(queryCompleteType, (data: any) => {
        if (!data.batchSummaries.some(s => s.hasError)) {
            commandObserver.logToOutputChannel(localize('extension.DeployCompleted', 'Deployment completed successfully.'));
        }
    });

    const queryMessageType: NotificationType<string, any> = new NotificationType('query/deployMessage');
    client.onNotification(queryMessageType, (data: any) => {
        var messageText = data.message.isError ? localize('extension.deployErrorMessage', "Error: {0}", data.message.message) : localize('extension.deployMessage', "{0}", data.message.message);
        commandObserver.logToOutputChannel(messageText);
    });

    const queryBatchStartType: NotificationType<string, any> = new NotificationType('query/deployBatchStart');
    client.onNotification(queryBatchStartType, (data: any) => {
        if (data.batchSummary.selection) {
            commandObserver.logToOutputChannel(localize('extension.runQueryBatchStartMessage', "\nStarted executing query at {0}", data.batchSummary.selection.startLine + 1));
        }
    });
}

function generateServerOptions(executablePath: string): ServerOptions {
	let serverArgs = [];
	let serverCommand: string = executablePath;

	let config = vscode.workspace.getConfiguration("pgsql");
	if (config) {
		// Override the server path with the local debug path if enabled

		let useLocalSource = config["useDebugSource"];
		if (useLocalSource) {
			let localSourcePath = config["debugSourcePath"];
			let filePath = path.join(localSourcePath, "ostoolsservice/ostoolsservice_main.py");
			process.env.PYTHONPATH = localSourcePath;
			serverCommand = process.platform === 'win32' ? 'python' : 'python3';

			let enableStartupDebugging = config["enableStartupDebugging"];
			let debuggingArg = enableStartupDebugging ? '--enable-remote-debugging-wait' : '--enable-remote-debugging';
			let debugPort = config["debugServerPort"];
			debuggingArg += '=' + debugPort;
			serverArgs = [filePath, debuggingArg];
		}

		let logFileLocation = path.join(Utils.getDefaultLogLocation(), "pgsql");

		serverArgs.push('--log-dir=' + logFileLocation);
		serverArgs.push(logFileLocation);

		// Enable diagnostic logging in the service if it is configured
		let logDebugInfo = config["logDebugInfo"];
		if (logDebugInfo) {
			serverArgs.push('--enable-logging');
		}
	}

	// run the service host
	return  {  command: serverCommand, args: serverArgs, transport: TransportKind.stdio  };
}

function generateHandleServerProviderEvent() {
	let dots = 0;
	return (e: string, ...args: any[]) => {
		switch (e) {
			case Events.INSTALL_START:
				outputChannel.show(true);
				statusView.show();
				outputChannel.appendLine(`Installing ${Constants.serviceName} service to ${args[0]}`);
				statusView.text = 'Installing Service';
				break;
			case Events.INSTALL_END:
				outputChannel.appendLine('Installed');
				break;
			case Events.DOWNLOAD_START:
				outputChannel.appendLine(`Downloading ${args[0]}`);
				outputChannel.append(`(${Math.ceil(args[1] / 1024)} KB)`);
				statusView.text = 'Downloading Service';
				break;
			case Events.DOWNLOAD_PROGRESS:
				let newDots = Math.ceil(args[0] / 5);
				if (newDots > dots) {
					outputChannel.append('.'.repeat(newDots - dots));
					dots = newDots;
				}
				break;
			case Events.DOWNLOAD_END:
				outputChannel.appendLine('Done!');
				break;
			default:
				console.error(`Unknown event from Server Provider ${e}`);
				break;
		}
	};
}

// this method is called when your extension is deactivated
export function deactivate(): void {
}
