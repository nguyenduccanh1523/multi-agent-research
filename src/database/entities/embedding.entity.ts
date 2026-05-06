import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'tb_embeddings' })
export class EmbeddingEntity {
  @PrimaryGeneratedColumn({ name: 'embedding_id', type: 'bigint' })
  embeddingId!: string;

  @Column({ name: 'source_type', type: 'varchar', nullable: true })
  sourceType?: string | null;

  @Column({ name: 'source_table', type: 'varchar', length: 64, nullable: true })
  sourceTable?: string | null;

  @Column({ name: 'source_id', type: 'int', nullable: true })
  sourceId?: number | null;

  @Column({ name: 'source_field', type: 'varchar', nullable: true })
  sourceField?: string | null;

  @Column({ name: 'chunk_index', type: 'int', nullable: true })
  chunkIndex?: number | null;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId?: number | null;

  @Column({ name: 'research_company_id', type: 'int', nullable: true })
  researchCompanyId?: number | null;

  @Column({ name: 'content', type: 'text', nullable: true })
  content?: string | null;

  /**
   * Nếu TypeORM báo lỗi type vector,
   * bạn có thể bỏ field này khỏi Entity
   * và chỉ query bằng DataSource.query().
   */
  @Column({
    name: 'embedding',
    type: 'vector' as any,
    nullable: true,
    select: false,
  })
  embedding?: number[] | null;

  @Column({ name: 'model', type: 'varchar', nullable: true })
  model?: string | null;

  @Column({ name: 'dim', type: 'int', nullable: true })
  dim?: number | null;

  @Column({ name: 'metric', type: 'varchar', nullable: true })
  metric?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'content_hash', type: 'varchar', nullable: true })
  contentHash?: string | null;
}
