import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { CompanyEntity } from './company.entity';

@Entity({ name: 'tb_company_files' })
export class CompanyFileEntity {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id!: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId!: number;

  @Column({ name: 'source', type: 'text', nullable: true })
  source?: string | null;

  @Column({ name: 'filename', type: 'text', nullable: true })
  filename?: string | null;

  @Column({ name: 'url', type: 'text', nullable: true })
  url?: string | null;

  @Column({ name: 'ext', type: 'text', nullable: true })
  ext?: string | null;

  @Column({ name: 'content', type: 'text', nullable: true })
  content?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => CompanyEntity, (company) => company.files)
  @JoinColumn({ name: 'company_id' })
  company!: CompanyEntity;
}
