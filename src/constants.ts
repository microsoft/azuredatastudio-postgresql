/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export const serviceName = localize('extension.serviceName', 'pgSQLToolsService');
export const providerId = localize('extension.providerId', 'PGSQL');
export const serviceCrashMessage = localize('extension.serviceCrashMessage', 'PG SQL Tools Service component exited unexpectedly. Please restart Azure Data Studio.');
export const serviceCrashButton = localize('extension.serviceCrashButton', 'View Known Issues');
export const serviceCrashLink = localize('extension.serviceCrashLink', 'https://github.com/microsoft/pgtoolsservice/issues?q=is%3Aopen+is%3Aissue+label%3Aknown-issues');
export const projectOutputChannel = localize('extension.projectOutputChannel', 'pgSQLProject');
export const templateDoesNotExistMessage = localize('extension.templateDoesNotExistMessage', 'No templates matched the input template name: pgproj.');
