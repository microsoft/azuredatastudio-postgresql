/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SqlOpsDataClient, SqlOpsFeature } from 'dataprotocol-client';
import { ClientCapabilities, RPCMessageType, ServerCapabilities } from 'vscode-languageclient';
import * as azdata from 'azdata';
import * as contracts from './contracts';
import * as UUID from 'vscode-languageclient/lib/utils/uuid';
import { Disposable } from 'vscode';

import { ServerContextualizationParams, GetServerContextualizationRequest } from './contracts';

export class ServerContextualizationServiceFeature extends SqlOpsFeature<undefined> {
    constructor(client: SqlOpsDataClient) {
        super(client, [contracts.GenerateServerContextualizationNotification.type]);
    }

    public fillClientCapabilities(capabilities: ClientCapabilities): void {
    }

    public initialize(capabilities: ServerCapabilities): void {
        this.register(this.messages, {
            id: UUID.generateUuid(),
            registerOptions: undefined
        });
    }

    protected registerProvider(options: undefined): Disposable {
        const client = this._client;

        const generateServerContextualization = (ownerUri: string): Thenable<boolean> => {
            // TODO: Implement
            return Promise.resolve(true)
        };

        const getServerContextualization = (ownerUri: string): Thenable<azdata.contextualization.GetServerContextualizationResult> => {
            const params: contracts.ServerContextualizationParams = {
                ownerUri: ownerUri
            };

            return client.sendRequest(contracts.GetServerContextualizationRequest.type, params).then(
                r => r,
                e => {
                    client.logFailedRequest(contracts.GetServerContextualizationRequest.type, e);
                    return Promise.reject(e);
                }
            );
        };

        return azdata.dataprotocol.registerServerContextualizationProvider({
            providerId: client.providerId,
            generateServerContextualization: generateServerContextualization,
            getServerContextualization: getServerContextualization
        });
    }
}
