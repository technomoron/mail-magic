import { mailStore } from '../store/store.js';
import { StoredFile } from '../types.js';
import { api_form_type } from './form.js';
import { api_txmail_type } from './txmail.js';
interface LoadedTemplate {
    html: string;
    assets: StoredFile[];
}
export declare function loadFormTemplate(store: mailStore, form: api_form_type): Promise<LoadedTemplate>;
export declare function loadTxTemplate(store: mailStore, template: api_txmail_type): Promise<LoadedTemplate>;
export declare function importData(store: mailStore, options?: {
    force?: boolean;
}): Promise<void>;
export {};
