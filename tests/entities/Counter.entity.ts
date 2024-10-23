import { Entity, PrimaryGeneratedColumn } from '@steroidsjs/typeorm';

@Entity('counters')
export class Counter {
  @PrimaryGeneratedColumn()
  value: number;
}
