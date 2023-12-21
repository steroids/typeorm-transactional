import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { User } from './entities/User.entity';
import { UserReaderService } from './services/user-reader.service';
import { UserWriterService } from './services/user-writer.service';

import { initializeTransactionalContext, addTransactionalDataSource, StorageDriver } from '../src';
import { TaskService } from './services/task.service';
import { Task } from './entities/Task.entity';

describe('Integration with Nest.js', () => {
  let app: TestingModule;

  let readerService: UserReaderService;
  let writerService: UserWriterService;
  let taskService: TaskService;

  let dataSource: DataSource;

  beforeAll(async () => {
    const storageDriver =
      process.env.TEST_STORAGE_DRIVER && process.env.TEST_STORAGE_DRIVER in StorageDriver
        ? StorageDriver[process.env.TEST_STORAGE_DRIVER as keyof typeof StorageDriver]
        : StorageDriver.CLS_HOOKED;

    initializeTransactionalContext({ storageDriver });

    app = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory() {
            return {
              type: 'postgres',
              host: 'localhost',
              port: 5436,
              username: 'postgres',
              password: 'postgres',
              database: 'test',
              entities: [User, Task],
              synchronize: true,
              logging: false,
            };
          },
          async dataSourceFactory(options) {
            if (!options) {
              throw new Error('Invalid options passed');
            }

            return addTransactionalDataSource(new DataSource(options));
          },
        }),

        TypeOrmModule.forFeature([User, Task]),
      ],
      providers: [UserReaderService, UserWriterService, TaskService],
      exports: [],
    }).compile();

    readerService = app.get<UserReaderService>(UserReaderService);
    writerService = app.get<UserWriterService>(UserWriterService);
    taskService = app.get<TaskService>(TaskService);

    dataSource = app.get(DataSource);

    await dataSource.createEntityManager().clear(User);
    await dataSource.createEntityManager().clear(Task);
  });

  afterEach(async () => {
    await dataSource.createEntityManager().clear(User);
    await dataSource.createEntityManager().clear(Task);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create a user using service if transaction was completed successfully', async () => {
    const name = 'John Doe';
    const onTransactionCompleteSpy = jest.fn();

    const writtenPost = await writerService.createUser(name, onTransactionCompleteSpy);
    expect(writtenPost.name).toBe(name);

    const readPost = await readerService.findUserByName(name);
    expect(readPost?.name).toBe(name);

    expect(onTransactionCompleteSpy).toBeCalledTimes(1);
    expect(onTransactionCompleteSpy).toBeCalledWith(true);
  });

  it('should fail to create a user using service if error was thrown', async () => {
    const name = 'John Doe';
    const onTransactionCompleteSpy = jest.fn();

    await expect(() =>
      writerService.createUserAndThrow(name, onTransactionCompleteSpy),
    ).rejects.toThrowError();

    const readPost = await readerService.findUserByName(name);
    expect(readPost).toBeNull();

    expect(onTransactionCompleteSpy).toBeCalledTimes(1);
    expect(onTransactionCompleteSpy).toBeCalledWith(false);
  });

  it('should rollback transaction if error was thrown', async () => {
    const id = '99407c4f-fa64-432b-874e-1f842609983f';

    await expect(() =>
      taskService.upsertTask({
        id,
        name: 'Some task',
      }),
    ).rejects.toThrowError();

    const task = await taskService.findTaskById(id);
    expect(task).toBeNull();
  });
});
