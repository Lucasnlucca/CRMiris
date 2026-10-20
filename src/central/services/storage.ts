import type { Database, Session } from '../types';

export const STORAGE_KEY = 'central-operacoes.demo.v1';
export interface StoredState {
  data: Database;
  session: Session | null;
}
export interface Persistence {
  read(): StoredState | null;
  write(state: StoredState): void;
}

export class PersistenceError extends Error {
  constructor(
    message = 'Não foi possível salvar no navegador. Verifique o espaço disponível e tente novamente.',
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}

/** The only module that accesses browser storage. A single key keeps writes atomic. */
export const browserPersistence: Persistence = {
  read(): StoredState | null {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredState) : null;
    } catch {
      throw new PersistenceError(
        'Não foi possível ler os dados locais. A demonstração foi carregada com os dados de exemplo.',
      );
    }
  },
  write(state: StoredState): void {
    try {
      if (typeof window === 'undefined') return;
      const serialized = JSON.stringify(state, (_key, value: unknown) => {
        if (typeof Blob !== 'undefined' && value instanceof Blob)
          throw new Error('Arquivos devem ficar somente em memória.');
        return value;
      });
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError();
    }
  },
};
