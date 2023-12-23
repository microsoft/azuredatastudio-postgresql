/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType, NotificationType } from "vscode-languageclient";
import * as azdata from 'azdata';
import * as telemetry from '@microsoft/ads-extension-telemetry';

// ------------------------------- < Telemetry Sent Event > ------------------------------------

/**
 * Event sent when the language service send a telemetry event
 */

export namespace TelemetryNotification {
    export const type = new NotificationType<TelemetryParams, void>('telemetry/pgsqlevent');
}

/**
 * Update event parameters
 */

export class TelemetryParams {
    public params!: {
        eventName: string;
        properties: telemetry.TelemetryEventProperties;
        measures: telemetry.TelemetryEventMeasures;
    }
}
// ------------------------------- </ Telemetry Sent Event > ------------------------------------

// ------------------------------- < Server Contextualization API > ------------------------------------

export interface ServerContextualizationParams {
    ownerUri: string;
}

export namespace GenerateServerContextualizationNotification {
    export const type = new NotificationType<
            ServerContextualizationParams, void
        >('metadata/generateServerContext');
}

export namespace GetServerContextualizationRequest {
    export const type =
        new RequestType<
            ServerContextualizationParams,
            azdata.contextualization.GetServerContextualizationResult,
            void, void
        >('metadata/getServerContext');
}

// ------------------------------- </ Server Contextualization API > ------------------------------------
