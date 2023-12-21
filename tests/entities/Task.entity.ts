import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('tasks')
export class Task {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;
}
