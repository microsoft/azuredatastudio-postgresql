import {Runtime} from './platform';
import SqlToolsServiceClient from '../languageservice/serviceClient';
import * as Utils from './utils';
import {ILanguageClientHelper} from './contracts/languageService';
import * as SharedConstants from './sharedConstants';
import {ServerOptions, TransportKind} from 'dataprotocol-client';
import {workspace} from 'vscode';
import { Constants } from './constants';
const path = require('path');

export default class LanguageClientHelper implements ILanguageClientHelper {
    public createServerOptions(servicePath: string, runtimeId: Runtime): ServerOptions {
        let serverArgs = [];
        let serverCommand: string = servicePath;

        let config = workspace.getConfiguration(SqlToolsServiceClient.constants.extensionConfigSectionName);
        if (config) {
            // Override the server path with the local debug path if enabled

            let useLocalSource = config[SharedConstants.configUseDebugSource];
            if (useLocalSource) {
                let constants = new Constants();
                let localSourcePath = config[constants.configDebugSourcePath];
                let filePath = path.join(localSourcePath, constants.localSourceFilename);
                process.env.PYTHONPATH = localSourcePath;
                console.log('CreateServerOptions runtime ID is ', runtimeId);
                serverCommand = runtimeId === Runtime.Windows_64 || runtimeId === Runtime.Windows_86 ? 'python' : 'python3';

                let enableStartupDebugging = config[constants.configStartupDebugging];
                let debuggingArg = enableStartupDebugging ? '--enable-remote-debugging-wait' : '--enable-remote-debugging';
                let debugPort = config[constants.configDebugServerPort];
                debuggingArg += '=' + debugPort;
                serverArgs = [filePath, debuggingArg];
            }

            let logFileLocation = path.join(Utils.getDefaultLogLocation(), SqlToolsServiceClient.constants.extensionName);

            serverArgs.push('--log-dir=' + logFileLocation);
            serverArgs.push(logFileLocation);

            // Enable diagnostic logging in the service if it is configured
            let logDebugInfo = config[SharedConstants.configLogDebugInfo];
            if (logDebugInfo) {
                serverArgs.push('--enable-logging');
            }
        }

        // run the service host
        let serverOptions: ServerOptions = {  command: serverCommand, args: serverArgs, transport: TransportKind.stdio  };
        return serverOptions;
    }

}
