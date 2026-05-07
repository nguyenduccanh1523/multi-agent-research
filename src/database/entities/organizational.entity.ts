import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ResearchCompanyEntity } from './research-company.entity';

@Entity({ name: 'tb_organizational' })
export class OrganizationalEntity {
  @PrimaryGeneratedColumn({ name: 'organizational_id' })
  organizationalId!: number;

  @Column({ name: 'research_id', type: 'int' })
  researchId!: number;

  @Column({ name: 'name', type: 'varchar', length: 255, nullable: true })
  name?: string | null;

  @Column({ name: 'role', type: 'varchar', length: 255, nullable: true })
  role?: string | null;

  @Column({ name: 'linkedin', type: 'text', nullable: true })
  linkedin?: string | null;

  @Column({ name: 'email', type: 'text', nullable: true })
  email?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => ResearchCompanyEntity, (research) => research.organizational)
  @JoinColumn({ name: 'research_id' })
  researchCompany!: ResearchCompanyEntity;
}
