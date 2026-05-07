import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'research_pipeline_runs' })
export class ResearchPipelineRunEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId?: string | null;

  @Column({ name: 'mode', type: 'varchar', length: 20 })
  mode!: string;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status!: string;

  @Column({ name: 'user_id', type: 'int' })
  userId!: number;

  @Column({ name: 'research_company_id', type: 'int', nullable: true })
  researchCompanyId?: number | null;

  @Column({ name: 'input_json', type: 'jsonb', default: {} })
  inputJson!: Record<string, any>;

  @Column({ name: 'final_output_json', type: 'jsonb', nullable: true })
  finalOutputJson?: Record<string, any> | null;

  @Column({ name: 'error_json', type: 'jsonb', nullable: true })
  errorJson?: Record<string, any> | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
