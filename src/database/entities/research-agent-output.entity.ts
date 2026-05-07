import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'research_agent_outputs' })
export class ResearchAgentOutputEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Column({ name: 'pipeline_run_id', type: 'uuid' })
  pipelineRunId!: string;

  @Column({ name: 'agent_task_id', type: 'uuid' })
  agentTaskId!: string;

  @Column({ name: 'agent_type', type: 'varchar', length: 80 })
  agentType!: string;

  @Column({ name: 'input_snapshot_json', type: 'jsonb', default: {} })
  inputSnapshotJson!: Record<string, any>;

  @Column({ name: 'output_json', type: 'jsonb', default: {} })
  outputJson!: Record<string, any>;

  @Column({ name: 'normalized_output_json', type: 'jsonb', default: {} })
  normalizedOutputJson!: Record<string, any>;

  @Column({ name: 'token_usage_json', type: 'jsonb', nullable: true })
  tokenUsageJson?: Record<string, any> | null;

  @Column({ name: 'latency_ms', type: 'int', nullable: true })
  latencyMs?: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
