/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
* Duplicated from Lewis Sanchez's contextualization feature in ADS.
* The definitions are not exported from the core ADS package, so we have to
* duplicate them here.
*
* Cross your fingers, and hope the upstream defintions don't change.
*/

import { Disposable } from 'vscode';

declare module 'azdata' {
	export namespace contextualization {
		export interface GetServerContextualizationResult {
			/**
			 * An array containing the generated server context.
			 */
			context: string[];
		}

		export interface ServerContextualizationProvider extends DataProvider {
			/**
			 * Generates server context.
			 * @param ownerUri The URI of the connection to generate context for.
			 */
			generateServerContextualization(ownerUri: string): void;

			/**
			 * Gets server context, which can be in the form of create scripts but is left up each provider.
			 * @param ownerUri The URI of the connection to get context for.
			 */
			getServerContextualization(ownerUri: string): Thenable<GetServerContextualizationResult>;
		}
	}

	export namespace dataprotocol {
		/**
		 * Registers a server contextualization provider, which can provide context about a server to extensions like GitHub
		 * Copilot for improved suggestions.
		 * @param provider The provider to register
		 */
		export function registerServerContextualizationProvider(provider: contextualization.ServerContextualizationProvider): Disposable
	}
}
