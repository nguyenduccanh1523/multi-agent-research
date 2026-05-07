import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { CompanyEntity } from './company.entity';

@Entity({ name: 'tb_company_related' })
export class CompanyRelatedEntity {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id!: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId!: number;

  @Column({ name: 'relation_type', type: 'text' })
  relationType!: string;

  @Column({ name: 'name', type: 'text' })
  name!: string;

  @Column({ name: 'url', type: 'jsonb', nullable: true })
  url?: any;

  @Column({ name: 'note', type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => CompanyEntity, (company) => company.relatedEntities)
  @JoinColumn({ name: 'company_id' })
  company!: CompanyEntity;
}
