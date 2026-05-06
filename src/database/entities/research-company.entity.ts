import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ComparisonEntity } from './comparison.entity';
import { CrawlDataEntity } from './crawl-data.entity';
import { OrganizationalEntity } from './organizational.entity';
import { ResearchScoreEntity } from './research-score.entity';

@Entity({ name: 'tb_research_company' })
export class ResearchCompanyEntity {
  @PrimaryGeneratedColumn({ name: 'research_company_id' })
  researchCompanyId!: number;

  @Column({
    name: 'company_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  companyName?: string | null;

  @Column({ name: 'user_id', type: 'int' })
  userId!: number;

  @Column({ name: 'website', type: 'varchar', length: 255, nullable: true })
  website?: string | null;

  @Column({ name: 'tax_code', type: 'varchar', length: 50, nullable: true })
  taxCode?: string | null;

  @Column({ name: 'upload_docs', type: 'text', nullable: true })
  uploadDocs?: string | null;

  @Column({ name: 'upload_docs_ai', type: 'text', nullable: true })
  uploadDocsAi?: string | null;

  @Column({ name: 'role', type: 'varchar', length: 255, nullable: true })
  role?: string | null;

  @Column({ name: 'focus_on', type: 'varchar', length: 255, nullable: true })
  focusOn?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updatedAt?: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt?: Date | null;

  @OneToMany(() => CrawlDataEntity, (crawl) => crawl.researchCompany)
  crawlData?: CrawlDataEntity[];

  @OneToMany(() => ComparisonEntity, (comparison) => comparison.researchCompany)
  comparisons?: ComparisonEntity[];

  @OneToMany(() => OrganizationalEntity, (org) => org.researchCompany)
  organizational?: OrganizationalEntity[];

  @OneToMany(() => ResearchScoreEntity, (score) => score.researchCompany)
  scores?: ResearchScoreEntity[];
}
