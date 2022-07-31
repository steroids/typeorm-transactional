import { createNamespace, getNamespace, Namespace } from 'cls-hooked';
import { DataSource, EntityManager } from 'typeorm';
import {
  NAMESPACE_NAME,
  TYPEORM_DATA_SOURCE_NAM,
  TYPEORM_DATA_TOKEN_PREFIX,
  TYPEORM_ENTITY_MANAGER_NAME,
  TYPEORM_HOOK_NAME,
} from './constants';
import { EventEmitter } from 'events';

type Token = string | 'default';

interface AddTransactionalDataSourceInput {
  token: string;
  dataSource: DataSource;
}

/**
 * Map of added data sources.
 *
 * The property "name" in the `DataSource` is deprecated, so we add own names to distinguish data sources.
 */
const dataSources = new Map<Token, DataSource>();

export const getTransactionalContext = () => getNamespace(NAMESPACE_NAME);

export const getEntityManagerByToken = (context: Namespace, token: Token) => {
  if (!dataSources.has(token)) return null;

  return (context.get(TYPEORM_DATA_TOKEN_PREFIX + token) as EntityManager) || null;
};

export const setEntityManagerByToken = (
  context: Namespace,
  token: Token,
  entityManager: EntityManager | null,
) => {
  if (!dataSources.has(token)) return;

  context.set(TYPEORM_DATA_TOKEN_PREFIX + token, entityManager);
};

const getEntityManagerInContext = (token: Token, entityManager: EntityManager) => {
  const context = getTransactionalContext();
  if (!context || !context.active) return entityManager;

  return getEntityManagerByToken(context, token) || entityManager;
};

export const initializeTransactionalContext = () => {
  const originalGetRepository = EntityManager.prototype.getRepository;

  EntityManager.prototype.getRepository = function (...args: unknown[]) {
    const repository = originalGetRepository.apply(this, args);

    if (!(TYPEORM_ENTITY_MANAGER_NAME in repository)) {
      /**
       * Store current manager
       */
      repository[TYPEORM_ENTITY_MANAGER_NAME] = repository.manager;

      /**
       * Patch repository object
       */
      Object.defineProperty(repository, 'manager', {
        get() {
          return getEntityManagerInContext(
            this[TYPEORM_ENTITY_MANAGER_NAME].connection[TYPEORM_DATA_SOURCE_NAM] as Token,
            this[TYPEORM_ENTITY_MANAGER_NAME] as EntityManager,
          );
        },
        set(manager: EntityManager | undefined) {
          this[TYPEORM_ENTITY_MANAGER_NAME] = manager;
        },
      });
    }

    return repository;
  };

  return createNamespace(NAMESPACE_NAME) || getNamespace(NAMESPACE_NAME);
};

export const addTransactionalDataSources = (
  input: DataSource | AddTransactionalDataSourceInput[],
) => {
  if (input instanceof DataSource) {
    input = [{ token: 'default', dataSource: input }];
  }

  for (const { token, dataSource } of input) {
    if (dataSources.has(token)) {
      throw new Error(`Token "${token}" has already added`);
    }

    dataSources.set(token, dataSource);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    dataSource[TYPEORM_DATA_SOURCE_NAM] = token;
  }
};

export const getDataSourceByToken = (token: Token) => dataSources.get(token);

export const getHookInContext = (context: Namespace | undefined) =>
  context?.get(TYPEORM_HOOK_NAME) as EventEmitter | null;

export const setHookInContext = (context: Namespace, emitter: EventEmitter | null) =>
  context.set(TYPEORM_HOOK_NAME, emitter);
