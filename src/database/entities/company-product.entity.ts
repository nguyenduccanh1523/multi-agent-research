import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { CompanyEntity } from './company.entity';

@Entity({ name: 'tb_company_product' })
export class CompanyProductEntity {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id!: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId!: number;

  @Column({ name: 'product_name', type: 'text' })
  productName!: string;

  @Column({ name: 'category', type: 'text', nullable: true })
  category?: string | null;

  @Column({ name: 'unique_features_summary', type: 'text', nullable: true })
  uniqueFeaturesSummary?: string | null;

  @Column({ name: 'use_cases_summary', type: 'text', nullable: true })
  useCasesSummary?: string | null;

  @Column({ name: 'specifications_summary', type: 'text', nullable: true })
  specificationsSummary?: string | null;

  @Column({ name: 'short_description', type: 'text', nullable: true })
  shortDescription?: string | null;

  @Column({ name: 'full_description', type: 'text', nullable: true })
  fullDescription?: string | null;

  @Column({ name: 'categories', type: 'jsonb', nullable: true })
  categories?: any;

  @Column({ name: 'features', type: 'jsonb', nullable: true })
  features?: any;

  @Column({ name: 'specs', type: 'jsonb', nullable: true })
  specs?: any;

  @Column({ name: 'pricing_info', type: 'text', nullable: true })
  pricingInfo?: string | null;

  @Column({ name: 'target_customers', type: 'jsonb', nullable: true })
  targetCustomers?: any;

  @Column({ name: 'distribution_channels', type: 'jsonb', nullable: true })
  distributionChannels?: any;

  @Column({ name: 'known_competitors', type: 'jsonb', nullable: true })
  knownCompetitors?: any;

  @Column({ name: 'raw_json', type: 'jsonb', nullable: true })
  rawJson?: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => CompanyEntity, (company) => company.products)
  @JoinColumn({ name: 'company_id' })
  company!: CompanyEntity;
}
