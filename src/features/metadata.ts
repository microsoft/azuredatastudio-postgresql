/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SqlOpsDataClient, SqlOpsFeature } from 'dataprotocol-client';
import { ClientCapabilities, RPCMessageType, ServerCapabilities } from 'vscode-languageclient';
import * as UUID from 'vscode-languageclient/lib/utils/uuid';
import { Disposable } from 'vscode';

import { PgSchemaMetadataParams, PgSchemaMetadataRequest, PgSchemaMetadataResponse } from './contracts';

export class PgSchemaMetadataFeature extends SqlOpsFeature<undefined> {
    constructor(client: SqlOpsDataClient) {
        super(client, [PgSchemaMetadataRequest.type]);
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

        let getSchemaMetadata = (ownerUri: string): Thenable<PgSchemaMetadataResponse> => {
            const params: PgSchemaMetadataParams = {
                ownerUri: ownerUri
            };

            return client.sendRequest(PgSchemaMetadataRequest.type, params).then(
                r => r,
                e => {
                    client.logFailedRequest(PgSchemaMetadataRequest.type, e);
                    return Promise.reject(e);
                }
            );
        };

        // TODO: "register" the provider somehow
    }
}
