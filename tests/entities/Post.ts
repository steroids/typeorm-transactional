import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'

@Entity({ name: 'posts' })
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  message: string;
}
