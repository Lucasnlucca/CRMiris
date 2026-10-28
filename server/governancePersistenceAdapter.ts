/**
 * ============================================================================
 * FASE 6.4 — DURABLE GOVERNANCE PERSISTENCE ADAPTER (TS / VITE DEV)
 * ============================================================================
 * TypeScript ESM counterpart for Vite dev middleware integration (F36).
 * Persists and restores WritePolicyEngine governance state across restarts
 * using Appwrite `system_policy_governance` and HMAC-SHA256 signed local file.
 * ============================================================================
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Databases } from 'node-appwrite';
import type { WritePolicyEngine, PolicyMode } from './writePolicyEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const GOVERNANCE_COLLECTION_ID = 'system_policy_governance';
export const GOVERNANCE_DOC_ID = 'active_policy_state';
export const ALLOWED_PERSISTENT_DATABASES = new Set(['crm_db', 'crm_db_sandbox', 'crm_isolated_test']);
export const SUPPORTED_SCHEMA_VERSION = '1.0';
const DATA_DIR = path.resolve(__dirname, '.data');

function getSigningSecret(): Buffer {
    const base = process.env.GOVERNANCE_STATE_SECRET
        || process.env.APPWRITE_API_KEY
        || 'crm-hydra-governance-state-secret-v1';
    return crypto.createHash('sha256').update(`${base}:governance-state-v1`).digest();
}

function computeStateHmac(stateRecord: Record<string, any>): string {
    const canonical = JSON.stringify({
        schemaVersion: stateRecord.schemaVersion,
        targetDatabase: stateRecord.targetDatabase,
        mode: stateRecord.mode,
        killSwitchActive: Boolean(stateRecord.killSwitchActive),
        killSwitchActor: stateRecord.killSwitchActor || '',
        killSwitchReason: stateRecord.killSwitchReason || '',
        killSwitchActivatedAt: stateRecord.killSwitchActivatedAt || '',
        flagsJson: stateRecord.flagsJson
    });
    return crypto.createHmac('sha256', getSigningSecret()).update(canonical, 'utf8').digest('hex');
}

function getLocalFilePath(databaseId: string): string {
    const safeDb = String(databaseId || 'crm_db').replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(DATA_DIR, `governance_state_${safeDb}.json`);
}

function ensureDataDir(): void {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    } catch {
        // Ignore directory creation errors
    }
}

export class GovernancePersistenceAdapter {
    private databases: Databases | null;
    private databaseId: string;
    private collectionId: string;
    private documentId: string;
    private localFilePath: string;

    constructor(databases: Databases | null, databaseId: string = 'crm_db') {
        this.databases = databases || null;
        this.databaseId = databaseId || 'crm_db';
        this.collectionId = GOVERNANCE_COLLECTION_ID;
        this.documentId = GOVERNANCE_DOC_ID;
        this.localFilePath = getLocalFilePath(this.databaseId);

        this.assertDatabaseSafety();
    }

    assertDatabaseSafety(): void {
        if (!ALLOWED_PERSISTENT_DATABASES.has(this.databaseId)) {
            throw new Error(
                `[SECURITY VIOLATION] GovernancePersistenceAdapter só pode operar em bancos autorizados (${Array.from(ALLOWED_PERSISTENT_DATABASES).join(', ')}). Banco recebido: '${this.databaseId}'.`
            );
        }
    }

    assertSandboxSafety(): void {
        this.assertDatabaseSafety();
    }

    async ensureSchema(): Promise<boolean> {
        this.assertDatabaseSafety();
        if (!this.databases || typeof this.databases.getCollection !== 'function') {
            return false;
        }

        try {
            await this.databases.getCollection(this.databaseId, this.collectionId);
            return true;
        } catch (err: any) {
            if (err.code !== 404) {
                return false;
            }
        }

        try {
            await this.databases.createCollection(
                this.databaseId,
                this.collectionId,
                'System Policy Governance State',
                [],
                false,
                true
            );

            await this.databases.createStringAttribute(this.databaseId, this.collectionId, 'schemaVersion', 20, true);
            await this.databases.createStringAttribute(this.databaseId, this.collectionId, 'targetDatabase', 64, true);
            await this.databases.createStringAttribute(this.databaseId, this.collectionId, 'mode', 20, true);
            await this.databases.createBooleanAttribute(this.databaseId, this.collectionId, 'killSwitchActive', true);
            await this.databases.createStringAttribute(this.databaseId, this.collectionId, 'killSwitchActor', 128, false);
            await this.databases.createStringAttribute(this.databaseId, this.collectionId, 'killSwitchReason', 500, false);
            await this.databases.createStringAttribute(this.databaseId, this.collectionId, 'killSwitchActivatedAt', 64, false);
            await this.databases.createStringAttribute(this.databaseId, this.collectionId, 'flagsJson', 10000, true);
            await this.databases.createStringAttribute(this.databaseId, this.collectionId, 'circuitBreakerJson', 5000, true);
            await this.databases.createStringAttribute(this.databaseId, this.collectionId, 'auditLogJson', 65000, true);
            await this.databases.createStringAttribute(this.databaseId, this.collectionId, 'updatedAt', 64, true);
            await this.databases.createStringAttribute(this.databaseId, this.collectionId, 'updatedBy', 128, true);
            await this.databases.createStringAttribute(this.databaseId, this.collectionId, 'lastReason', 500, true);

            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 400));
                const col = await this.databases.getCollection(this.databaseId, this.collectionId);
                const allAvailable = (col.attributes || []).every((a: any) => a.status === 'available');
                if (allAvailable && (col.attributes || []).length >= 13) break;
            }
            return true;
        } catch {
            return false;
        }
    }

    private _writeLocalState(payload: Record<string, any>): void {
        ensureDataDir();
        const hmac = computeStateHmac(payload);
        const envelope = {
            ...payload,
            signature: hmac
        };
        const tmpFile = `${this.localFilePath}.tmp.${process.pid}`;
        fs.writeFileSync(tmpFile, JSON.stringify(envelope, null, 2), 'utf8');
        fs.renameSync(tmpFile, this.localFilePath);
    }

    private _readLocalState(): Record<string, any> | null {
        if (!fs.existsSync(this.localFilePath)) {
            return null;
        }
        const raw = fs.readFileSync(this.localFilePath, 'utf8');
        if (!raw || !raw.trim()) {
            throw new Error('Arquivo local de governança está vazio ou corrompido.');
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Estrutura JSON inválida no arquivo de governança.');
        }
        const expectedHmac = computeStateHmac(parsed);
        if (!parsed.signature || parsed.signature !== expectedHmac) {
            throw new Error('Assinatura HMAC de integridade do estado de governança inválida.');
        }
        return parsed;
    }

    private _validateStateRecord(doc: Record<string, any>) {
        if (!doc || typeof doc !== 'object') {
            throw new Error('Documento de governança ausente ou inválido.');
        }
        if (doc.schemaVersion && doc.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
            throw new Error(`Versão de schema de governança incompatível: '${doc.schemaVersion}' (esperado '${SUPPORTED_SCHEMA_VERSION}').`);
        }
        if (doc.targetDatabase && doc.targetDatabase !== this.databaseId) {
            throw new Error(`Divergência de banco no estado persistido: '${doc.targetDatabase}' vs '${this.databaseId}'.`);
        }
        if (!['shadow', 'enforce', 'off'].includes(doc.mode)) {
            throw new Error(`Modo de governança corrompido no estado persistido: '${doc.mode}'.`);
        }
        const parsedFlags = typeof doc.flagsJson === 'string' ? JSON.parse(doc.flagsJson) : doc.flags;
        if (!parsedFlags || typeof parsedFlags !== 'object') {
            throw new Error('Flags de governança ausentes ou malformadas no estado persistido.');
        }
        return {
            parsedFlags,
            parsedAudit: typeof doc.auditLogJson === 'string' && doc.auditLogJson ? JSON.parse(doc.auditLogJson) : [],
            parsedCb: typeof doc.circuitBreakerJson === 'string' && doc.circuitBreakerJson ? JSON.parse(doc.circuitBreakerJson) : null
        };
    }

    async persistEngineState(
        engine: WritePolicyEngine,
        actor: string = 'system',
        reason: string = 'State sync',
        targetDatabaseOverride?: string | null
    ): Promise<any> {
        this.assertDatabaseSafety();
        const effectiveDb = targetDatabaseOverride || this.databaseId;
        const exported = engine.exportGovernanceState(effectiveDb);

        const payload = {
            schemaVersion: SUPPORTED_SCHEMA_VERSION,
            targetDatabase: effectiveDb,
            mode: exported.mode,
            killSwitchActive: Boolean(exported.killSwitch.active),
            killSwitchActor: exported.killSwitch.actor || '',
            killSwitchReason: exported.killSwitch.reason || '',
            killSwitchActivatedAt: exported.killSwitch.activatedAt || '',
            flagsJson: JSON.stringify(exported.flags),
            circuitBreakerJson: JSON.stringify(exported.circuitBreaker),
            auditLogJson: JSON.stringify(exported.governanceAuditLog.slice(0, 30)),
            updatedAt: new Date().toISOString(),
            updatedBy: actor,
            lastReason: reason
        };

        let localSucceeded = false;
        let remoteSucceeded = false;
        let lastError: any = null;

        try {
            this._writeLocalState(payload);
            localSucceeded = true;
        } catch (localErr: any) {
            lastError = localErr;
            console.warn('[GovernancePersistence] Warning writing local governance state file:', localErr.message);
        }

        if (this.databases && typeof this.databases.updateDocument === 'function') {
            try {
                const res = await this.databases.updateDocument(this.databaseId, this.collectionId, this.documentId, payload);
                remoteSucceeded = true;
                return res;
            } catch (err: any) {
                lastError = err;
                if (err.code === 404 && typeof this.databases.createDocument === 'function') {
                    try {
                        const res = await this.databases.createDocument(this.databaseId, this.collectionId, this.documentId, payload);
                        remoteSucceeded = true;
                        return res;
                    } catch (createErr: any) {
                        lastError = createErr;
                    }
                }
            }
        }

        if (!localSucceeded && !remoteSucceeded) {
            const fatalErr: any = new Error(`Falha na persistência da governança: Nem o arquivo local nem o banco Appwrite conseguiram gravar o estado. ${lastError ? lastError.message : ''}`);
            fatalErr.code = 'GOVERNANCE_PERSISTENCE_FAILED';
            throw fatalErr;
        }

        return payload;
    }

    async restoreIntoEngine(engine: WritePolicyEngine): Promise<{
        restored: boolean;
        reason?: string;
        updatedAt?: string;
        updatedBy?: string;
        lastReason?: string;
        source?: string;
    }> {
        this.assertDatabaseSafety();

        let doc: any = null;
        let source = 'NONE';

        if (this.databases && typeof this.databases.getDocument === 'function') {
            try {
                doc = await this.databases.getDocument(this.databaseId, this.collectionId, this.documentId);
                if (doc) source = 'APPWRITE';
            } catch {
                // Fallback to local file
            }
        }

        if (!doc) {
            const localDoc = this._readLocalState();
            if (localDoc) {
                doc = localDoc;
                source = 'LOCAL_SIGNED_FILE';
            }
        } else {
            try {
                const localDoc = this._readLocalState();
                if (localDoc && localDoc.updatedAt && doc.updatedAt) {
                    if (new Date(localDoc.updatedAt) > new Date(doc.updatedAt)) {
                        doc = localDoc;
                        source = 'LOCAL_SIGNED_FILE';
                    }
                }
            } catch {
                // Keep Appwrite doc
            }
        }

        if (!doc) {
            await this.persistEngineState(engine, 'system:boot', 'Initial governance state created on first boot');
            return { restored: false, reason: 'FIRST_BOOT_CREATED_DEFAULT', source: 'DEFAULT' };
        }

        const { parsedFlags, parsedAudit, parsedCb } = this._validateStateRecord(doc);

        engine.mode = doc.mode as PolicyMode;
        engine.killSwitchActive = Boolean(doc.killSwitchActive);
        engine.killSwitchActor = doc.killSwitchActor || null;
        engine.killSwitchReason = doc.killSwitchReason || null;
        engine.killSwitchActivatedAt = doc.killSwitchActivatedAt || null;

        engine.flags = {
            global: parsedFlags.global !== undefined ? Boolean(parsedFlags.global) : true,
            modules: { ...engine.flags.modules, ...(parsedFlags.modules || {}) },
            tenants: { ...(parsedFlags.tenants || {}) }
        };

        if (parsedCb && typeof parsedCb === 'object' && engine.circuitBreaker) {
            if (['CLOSED', 'OPEN', 'HALF_OPEN'].includes(parsedCb.state)) {
                engine.circuitBreaker.state = parsedCb.state;
                engine.circuitBreaker.consecutiveFailures = Number(parsedCb.consecutiveFailures || 0);
                engine.circuitBreaker.trippedAt = parsedCb.trippedAt || null;
                engine.circuitBreaker.tripReason = parsedCb.tripReason || null;
            }
        }

        if (Array.isArray(parsedAudit)) {
            engine.governanceAuditLog = parsedAudit;
        }

        return {
            restored: true,
            updatedAt: doc.updatedAt,
            updatedBy: doc.updatedBy,
            lastReason: doc.lastReason,
            source
        };
    }
}
