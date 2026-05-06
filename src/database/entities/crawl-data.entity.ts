import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ResearchCompanyEntity } from './research-company.entity';

@Entity({ name: 'tb_crawl_data' })
export class CrawlDataEntity {
  @PrimaryGeneratedColumn({ name: 'craw_data_id' })
  crawDataId!: number;

  @Column({ name: 'research_id', type: 'int' })
  researchId!: number;

  @Column({ name: 'corporate_initiatives', type: 'text', nullable: true })
  corporateInitiatives?: string | null;

  @Column({ name: 'trigger_events', type: 'text', nullable: true })
  triggerEvents?: string | null;

  @Column({ name: 'tech_stack', type: 'text', nullable: true })
  techStack?: string | null;

  @Column({ name: 'financial_capacity', type: 'text', nullable: true })
  financialCapacity?: string | null;

  @Column({ name: 'domain', type: 'text', nullable: true })
  domain?: string | null;

  @Column({ name: 'business_data', type: 'json', nullable: true })
  businessData?: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => ResearchCompanyEntity, (research) => research.crawlData)
  @JoinColumn({ name: 'research_id' })
  researchCompany!: ResearchCompanyEntity;
}
