import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from '../../src';

import { Task } from '../entities/Task.entity';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {}

  async findTaskById(id: string): Promise<Task | null> {
    return this.taskRepository.findOneBy({ id });
  }

  @Transactional()
  async upsertTask({ id, name }: Task): Promise<Task> {
    const taskSaved = await this.taskRepository.save({ id, name });

    // delete a task that does not exist to test transaction rollback
    await this.taskRepository.delete({ id: 'non-existing-id' });

    return taskSaved;
  }
}
