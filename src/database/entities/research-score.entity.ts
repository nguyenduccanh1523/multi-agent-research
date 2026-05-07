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

@Entity({ name: 'tb_research_score' })
export class ResearchScoreEntity {
  @PrimaryGeneratedColumn({ name: 'research_score_id' })
  researchScoreId!: number;

  @Column({ name: 'research_company_id', type: 'int', unique: true })
  researchCompanyId!: number;

  @Column({ name: 'need_fit', type: 'int', nullable: true })
  needFit?: number | null;

  @Column({ name: 'need_fit_summary', type: 'text', nullable: true })
  needFitSummary?: string | null;

  @Column({ name: 'solution_fit', type: 'int', nullable: true })
  solutionFit?: number | null;

  @Column({ name: 'solution_fit_summary', type: 'text', nullable: true })
  solutionFitSummary?: string | null;

  @Column({ name: 'initiative_fit', type: 'int', nullable: true })
  initiativeFit?: number | null;

  @Column({ name: 'initiative_fit_summary', type: 'text', nullable: true })
  initiativeFitSummary?: string | null;

  @Column({ name: 'execution_fit', type: 'int', nullable: true })
  executionFit?: number | null;

  @Column({ name: 'execution_fit_summary', type: 'text', nullable: true })
  executionFitSummary?: string | null;

  @Column({ name: 'risk_fit', type: 'int', nullable: true })
  riskFit?: number | null;

  @Column({ name: 'risk_fit_summary', type: 'text', nullable: true })
  riskFitSummary?: string | null;

  @Column({
    name: 'overall_score',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  overallScore?: string | null;

  @Column({ name: 'summary', type: 'text', nullable: true })
  summary?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => ResearchCompanyEntity, (research) => research.scores)
  @JoinColumn({ name: 'research_company_id' })
  researchCompany!: ResearchCompanyEntity;
}
