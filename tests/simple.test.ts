import { DataSource } from 'typeorm';
import { Post } from './entities/Post';
import {
  addTransactionalDataSources,
  initializeTransactionalContext,
  runInTransaction,
  runOnTransactionCommit,
  runOnTransactionRollback,
} from '../src';
import { PostReaderService } from './services/post-reader.service';
import { PostWriterService } from './services/post-writer.service';
import { Propagation } from '../src/common/propagation';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = new DataSource({
    type: 'postgres',
    host: 'localhost',
    port: 5435,
    username: 'postgres',
    password: 'postgres',
    database: 'test',
    entities: [Post],
    synchronize: true,
  });

  initializeTransactionalContext();
  addTransactionalDataSources([{ token: 'default', dataSource }]);

  await dataSource.initialize();

  dataSource.query('TRUNCATE TABLE posts;');
});

afterAll(async () => {
  await dataSource.destroy();
});

afterEach(async () => {
  await dataSource.query('TRUNCATE TABLE posts;');
});

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const message = 'a simple message';

describe('Simple tests', () => {
  it("shouldn't get post using raw typeorm", async () => {
    const [writtenPost, readPost] = await dataSource.transaction(async (manager) => {
      const writerService = new PostWriterService(manager.getRepository(Post));
      const readerService = new PostReaderService(dataSource.getRepository(Post));

      const writtenPost = await writerService.createPost(message);
      const readPost = await readerService.getPostByMessage(message);

      return [writtenPost, readPost];
    });

    expect(writtenPost.id).toBeGreaterThan(0);
    expect(readPost).toBeNull();
  });

  it('should get post using runInTransaction', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    let commitHookCalled = false;

    const [writtenPost, readPost] = await runInTransaction(async () => {
      const writtenPost = await writerService.createPost(message);
      const readPost = await readerService.getPostByMessage(message);

      runOnTransactionCommit(() => (commitHookCalled = true));

      return [writtenPost, readPost];
    });

    await sleep(100);

    expect(writtenPost.id).toBeGreaterThan(0);
    expect(readPost.id).toBe(writtenPost.id);
    expect(commitHookCalled).toBeTruthy();
  });

  it('should get post using Transactional decorator', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const writtenPost = await writerService.createPostWithDecorator(message);
    const readPost = await readerService.getPostByMessage(message);

    setImmediate(() => {
      expect(writtenPost.id).toBeGreaterThan(0);
      expect(readPost.id).toBe(writtenPost.id);
      expect(writerService.success).toBe(true);
    });
  });

  it('should fail create post using runInTransaction', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const [readPost] = await runInTransaction(async () => {
      expect(writerService.createPost(message, true)).rejects.toThrowError();

      const readPost = await readerService.getPostByMessage(message);

      return [readPost];
    });

    expect(readPost).toBeNull();
  });

  it('should fail create post using Transactional', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    expect(writerService.createPostWithDecorator(message, true)).rejects.toThrowError();

    const readPost = await readerService.getPostByMessage(message);

    await sleep(100);

    setImmediate(() => {
      expect(readPost).toBeNull();
      expect(writerService.success).toBe(false);
    });
  });

  it('should fail for mandatory propagation without existing transaction', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const fn = () =>
      runInTransaction(
        async () => {
          const writtenPost = await writerService.createPost(message);
          const readPost = await readerService.getPostByMessage(message);

          return [writtenPost, readPost];
        },
        {
          propagation: Propagation.MANDATORY,
        },
      );

    expect(fn).rejects.toThrowError();
  });

  it('should pass transaction for mandatory propagation', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const [writtenPost, readPost] = await runInTransaction(async () => {
      const writtenPost = await writerService.createPost(message);
      const readPost = await runInTransaction(async () => readerService.getPostByMessage(message), {
        propagation: Propagation.MANDATORY,
      });

      return [writtenPost, readPost];
    });

    expect(writtenPost.id).toBeGreaterThan(0);
    expect(readPost.id).toBe(writtenPost.id);
  });

  it('should fail for never propagation if transaction exists', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const fn = () =>
      runInTransaction(async () => {
        const writtenPost = await writerService.createPost(message);
        const readPost = await runInTransaction(() => readerService.getPostByMessage(message), {
          propagation: Propagation.NEVER,
        });

        return [writtenPost, readPost];
      });

    expect(fn).rejects.toThrowError();
  });

  it('should ignore transactions for not-supported propagation', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const [writtenPost, readPost] = await runInTransaction(async () => {
      const writtenPost = await writerService.createPost(message);
      const readPost = await runInTransaction(async () => readerService.getPostByMessage(message), {
        propagation: Propagation.NOT_SUPPORTED,
      });

      return [writtenPost, readPost];
    });

    expect(writtenPost.id).toBeGreaterThan(0);
    expect(readPost).toBeNull();
  });

  it('should suspend old transactions for "requires new" propagation', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const [writtenPost, readPost] = await runInTransaction(async () => {
      const writtenPost = await writerService.createPost(message);
      const readPost = await runInTransaction(async () => readerService.getPostByMessage(message), {
        propagation: Propagation.REQUIRES_NEW,
      });

      return [writtenPost, readPost];
    });

    expect(writtenPost.id).toBeGreaterThan(0);
    expect(readPost).toBeNull();
  });

  it('should create new transaction for "requires new" propagation', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const promise = runInTransaction(async () => {
      const a = writerService.createPost('1');
      const b = writerService.createPost('2');

      const c = new Promise((r) => setTimeout(() => r(new Error()), 200));

      runOnTransactionRollback(() => console.log('rollback'));

      await Promise.all([a, b, c]);
    });

    // expect(promise).rejects.toThrow();

    promise.then(async () => {
      console.log('count', await repository.count());
    });

    await sleep(300);

    // expect(hooksOrder[0]).toBe('inner');
    // expect(hooksOrder[1]).toBe('outer');
  });
});
