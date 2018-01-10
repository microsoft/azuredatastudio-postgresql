/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import vscode = require('vscode');
import { Constants } from '../models/constants';
import LanguageClientHelper from '../models/languageClientHelper';
import {Telemetry} from '../models/telemetry';
import * as Utils from '../models/utils';
import VscodeWrapper from './vscodeWrapper';
import SqlToolsServiceClient from '../languageservice/serviceClient';
import {IExtensionConstants} from '../models/contracts/contracts';
import * as SharedConstants from '../models/sharedConstants';


/**
 * The main controller class that initializes the extension
 */
export default class MainController implements vscode.Disposable {
    private _context: vscode.ExtensionContext;
    private _vscodeWrapper: VscodeWrapper;
    private _initialized: boolean = false;
    private static _extensionConstants: IExtensionConstants = new Constants();

    /**
     * The main controller constructor
     * @constructor
     */
    constructor(context: vscode.ExtensionContext,
                vscodeWrapper?: VscodeWrapper) {
        this._context = context;
        this._vscodeWrapper = vscodeWrapper || new VscodeWrapper(new Constants());
        SqlToolsServiceClient.constants = MainController._extensionConstants;
        SqlToolsServiceClient.helper = new LanguageClientHelper();
    }

    /**
     * Disposes the controller
     */
    dispose(): void {
        this.deactivate();
    }

    /**
     * Deactivates the extension
     */
    public deactivate(): void {
        Utils.logDebug(SharedConstants.extensionDeactivated, MainController._extensionConstants.extensionConfigSectionName);
    }

    /**
     * Initializes the extension
     */
    public activate():  Promise<boolean> {
        return this.initialize();
    }

    /**
     * Returns a flag indicating if the extension is initialized
     */
    public isInitialized(): boolean {
        return this._initialized;
    }

    /**
     * Initializes the extension
     */
    public initialize(): Promise<boolean> {
        const self = this;

        // initialize language service client
        return new Promise<boolean>( (resolve, reject) => {
            SqlToolsServiceClient.instance.initialize(self._context).then(serverResult => {
                // Initialize telemetry
                Telemetry.initialize(self._context, MainController._extensionConstants);

                // telemetry for activation
                Telemetry.sendTelemetryEvent('ExtensionActivated', {},
                    { serviceInstalled: serverResult.installedBeforeInitializing ? 1 : 0 }
                );

                Utils.logDebug(SharedConstants.extensionActivated, MainController._extensionConstants.extensionConfigSectionName);
                self._initialized = true;
                resolve(true);
            }).catch(err => {
                Telemetry.sendTelemetryEventForException(err, 'initialize', MainController._extensionConstants.extensionConfigSectionName);
                reject(err);
            });
        });
    }
}
