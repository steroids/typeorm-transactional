import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@steroidsjs/nest-typeorm';
import { Repository } from '@steroidsjs/typeorm';

import { Transactional } from '../../src';
import { User } from '../entities/User.entity';

@Injectable()
export class UserReaderService {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  @Transactional()
  async findUserByName(name: string): Promise<User | null> {
    return this.repository.findOneBy({ name });
  }
}
