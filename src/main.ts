/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SqlOpsDataClient, ClientOptions } from 'dataprotocol-client';
import { IConfig, ServerProvider, Events } from '@microsoft/ads-service-downloader';
import { NotificationType, ServerOptions, TransportKind } from 'vscode-languageclient';
import * as nls from 'vscode-nls';

// this should precede local imports because they can trigger localization calls
const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

import { CommandObserver } from './commandObserver';
import registerCommands from './commands';
import * as Helper from './commonHelper';
import * as Constants from './constants';
import ContextProvider from './contextProvider';
import * as Utils from './utils';
import { TelemetryReporter, LanguageClientErrorHandler } from './telemetry';
import { TelemetryFeature } from './features/telemetry';

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

	let packageInfo = Utils.getPackageInfo();
	let commandObserver = new CommandObserver();
	let clientOptions: ClientOptions = {
		providerId: Constants.providerId,
		errorHandler: new LanguageClientErrorHandler(),
		documentSelector: ['sql'],
		synchronize: {
			configurationSection: Constants.providerId
		},
		features: [
			// we only want to add new features
			...SqlOpsDataClient.defaultFeatures,
			TelemetryFeature
		]
	};

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
			statusView.text = Constants.providerId + ' service started';
			setTimeout(() => {
				statusView.hide();
			}, 1500);
			TelemetryReporter.sendTelemetryEvent('startup/LanguageClientStarted', {
				installationTime: String(installationComplete - installationStart),
				processStartupTime: String(processEnd - processStart),
				totalTime: String(processEnd - installationStart),
				beginningTimestamp: String(installationStart)
			});
			addDeployNotificationsHandler(languageClient, commandObserver);
		});
		statusView.show();
		statusView.text = 'Starting ' + Constants.providerId + ' service';
		languageClient.start();
	}, e => {
		TelemetryReporter.sendTelemetryEvent('ServiceInitializingFailed');
		vscode.window.showErrorMessage('Failed to start ' + Constants.providerId + ' tools service');
	});

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

	let contextProvider = new ContextProvider();
	context.subscriptions.push(contextProvider);
	context.subscriptions.push(TelemetryReporter);
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

	let config = vscode.workspace.getConfiguration('pgsql');
	if (config) {
		// Override the server path with the local debug path if enabled

		let useLocalSource = config["useDebugSource"];
		if (useLocalSource) {
			let localSourcePath = config["debugSourcePath"];
			let filePath = path.join(localSourcePath, "ossdbtoolsservice/ossdbtoolsservice_main.py");
			process.env.PYTHONPATH = localSourcePath;
			serverCommand = process.platform === 'win32' ? 'python' : 'python3';

			let enableStartupDebugging = config["enableStartupDebugging"];
			let debuggingArg = enableStartupDebugging ? '--enable-remote-debugging-wait' : '--enable-remote-debugging';
			let debugPort = config["debugServerPort"];
			debuggingArg += '=' + debugPort;
			serverArgs = [filePath, debuggingArg];
		}

		let logFileLocation = path.join(Utils.getDefaultLogLocation(), Constants.providerId);

		serverArgs.push('--log-dir=' + logFileLocation);
		serverArgs.push(logFileLocation);

		// Enable diagnostic logging in the service if it is configured
		let logDebugInfo = config["logDebugInfo"];
		if (logDebugInfo) {
			serverArgs.push('--enable-logging');
		}
	}

	serverArgs.push('provider=' + Constants.providerId);
	// run the service host
	return { command: serverCommand, args: serverArgs, transport: TransportKind.stdio };
}

function generateHandleServerProviderEvent() {
	let dots = 0;
	return (e: string, ...args: any[]) => {
		outputChannel.show();
		statusView.show();
		switch (e) {
			case Events.INSTALL_START:
				outputChannel.appendLine(`Installing ${Constants.serviceName} to ${args[0]}`);
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
		}
	};
}

// this method is called when your extension is deactivated
export function deactivate(): void {
	const tempFolder = fs.realpathSync(os.tmpdir());
    const tempFolders = fs.readdirSync(tempFolder).filter((file) => file.startsWith('_MEI'));

    tempFolders.forEach((folder) => {
        const folderPath = path.join(tempFolder, folder);
        if (fs.existsSync(folderPath)) {
            fs.rmdirSync(folderPath, { recursive: true });
        }
    });
}