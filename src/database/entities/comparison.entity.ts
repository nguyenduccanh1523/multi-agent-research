import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ResearchCompanyEntity } from './research-company.entity';

@Entity({ name: 'tb_comparison' })
export class ComparisonEntity {
  @PrimaryGeneratedColumn({ name: 'comparision_id' })
  comparisonId!: number;

  @Column({ name: 'research_id', type: 'int' })
  researchId!: number;

  @Column({ name: 'why_now', type: 'text', nullable: true })
  whyNow?: string | null;

  @Column({ name: 'why_us', type: 'text', nullable: true })
  whyUs?: string | null;

  @Column({ name: 'why_this', type: 'text', nullable: true })
  whyThis?: string | null;

  @Column({ name: 'meddics', type: 'json', nullable: true })
  meddics?: any;

  @Column({
    name: 'detail_level',
    type: 'varchar',
    length: 10,
    default: 'detail',
  })
  detailLevel!: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    default: 'processing',
  })
  status!: string;

  @Column({ name: 'compare_partner', type: 'json', nullable: true })
  comparePartner?: any;

  @Column({ name: 'compare_enemies', type: 'json', nullable: true })
  compareEnemies?: any;

  @Column({ name: 'compare_overall', type: 'json', nullable: true })
  compareOverall?: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updatedAt?: Date | null;

  @ManyToOne(() => ResearchCompanyEntity, (research) => research.comparisons)
  @JoinColumn({ name: 'research_id' })
  researchCompany!: ResearchCompanyEntity;
}
