import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'research_agent_tasks' })
export class ResearchAgentTaskEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Column({ name: 'pipeline_run_id', type: 'uuid' })
  pipelineRunId!: string;

  @Column({ name: 'agent_type', type: 'varchar', length: 80 })
  agentType!: string;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status!: string;

  @Column({ name: 'depends_on', type: 'jsonb', default: [] })
  dependsOn!: string[];

  @Column({ name: 'required', type: 'boolean', default: true })
  required!: boolean;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'max_retries', type: 'int', default: 1 })
  maxRetries!: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @Column({ name: 'error_json', type: 'jsonb', nullable: true })
  errorJson?: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
