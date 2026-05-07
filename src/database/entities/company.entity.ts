import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { CompanyFileEntity } from './company-file.entity';
import { CompanyProductEntity } from './company-product.entity';
import { CompanyRelatedEntity } from './company-related.entity';

@Entity({ name: 'tb_company' })
export class CompanyEntity {
  @PrimaryGeneratedColumn({ name: 'company_id' })
  companyId!: number;

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

  @Column({ name: 'documents', type: 'text', nullable: true })
  documents?: string | null;

  @Column({ name: 'documents_ai', type: 'text', nullable: true })
  documentsAi?: string | null;

  @Column({ name: 'enemies', type: 'text', nullable: true })
  enemies?: string | null;

  @Column({ name: 'partners', type: 'text', nullable: true })
  partners?: string | null;

  @Column({ name: 'product_infor', type: 'text', nullable: true })
  productInfor?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => CompanyFileEntity, (file) => file.company)
  files?: CompanyFileEntity[];

  @OneToMany(() => CompanyRelatedEntity, (related) => related.company)
  relatedEntities?: CompanyRelatedEntity[];

  @OneToMany(() => CompanyProductEntity, (product) => product.company)
  products?: CompanyProductEntity[];
}
