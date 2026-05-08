import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { CompanyEntity } from '../database/entities/company.entity';
import { CompanyFileEntity } from '../database/entities/company-file.entity';
import { CompanyProductEntity } from '../database/entities/company-product.entity';
import { CompanyRelatedEntity } from '../database/entities/company-related.entity';
import { ComparisonEntity } from '../database/entities/comparison.entity';
import { CrawlDataEntity } from '../database/entities/crawl-data.entity';
import { OrganizationalEntity } from '../database/entities/organizational.entity';
import { ResearchCompanyEntity } from '../database/entities/research-company.entity';
import { ResearchScoreEntity } from '../database/entities/research-score.entity';

@Injectable()
export class ResearchDataRepository {
  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,

    @InjectRepository(CompanyFileEntity)
    private readonly companyFileRepo: Repository<CompanyFileEntity>,

    @InjectRepository(CompanyRelatedEntity)
    private readonly companyRelatedRepo: Repository<CompanyRelatedEntity>,

    @InjectRepository(CompanyProductEntity)
    private readonly companyProductRepo: Repository<CompanyProductEntity>,

    @InjectRepository(ResearchCompanyEntity)
    private readonly researchCompanyRepo: Repository<ResearchCompanyEntity>,

    @InjectRepository(CrawlDataEntity)
    private readonly crawlDataRepo: Repository<CrawlDataEntity>,

    @InjectRepository(ComparisonEntity)
    private readonly comparisonRepo: Repository<ComparisonEntity>,

    @InjectRepository(ResearchScoreEntity)
    private readonly researchScoreRepo: Repository<ResearchScoreEntity>,

    @InjectRepository(OrganizationalEntity)
    private readonly organizationalRepo: Repository<OrganizationalEntity>,
  ) {}

  async getCompanyProfileByUser(userId: number): Promise<Record<string, any>> {
    const company = await this.companyRepo.findOne({
      where: {
        userId,
      },
      relations: {
        files: true,
        relatedEntities: true,
        products: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (!company) {
      throw new NotFoundException(
        `Company profile not found for user ${userId}`,
      );
    }

    const partners = (company.relatedEntities ?? [])
      .filter((item) => item.relationType === 'partner')
      .map((item) => ({
        id: item.id,
        name: item.name,
        url: item.url,
        note: item.note,
      }));

    const competitors = (company.relatedEntities ?? [])
      .filter((item) => item.relationType === 'enemy')
      .map((item) => ({
        id: item.id,
        name: item.name,
        url: item.url,
        note: item.note,
      }));

    const documentsAi = (company.files ?? []).map((file, index) => ({
      id: index + 1,
      fileId: file.id,
      filename: file.filename,
      url: file.url,
      ext: file.ext,
      content: file.content,
      chars: file.content?.length ?? 0,
    }));

    const products = (company.products ?? []).map((product) => ({
      id: product.id,
      productName: product.productName,
      category: product.category,
      uniqueFeaturesSummary: product.uniqueFeaturesSummary,
      useCasesSummary: product.useCasesSummary,
      specificationsSummary: product.specificationsSummary,
      shortDescription: product.shortDescription,
      fullDescription: product.fullDescription,
      categories: product.categories,
      features: product.features,
      specs: product.specs,
      pricingInfo: product.pricingInfo,
      targetCustomers: product.targetCustomers,
      distributionChannels: product.distributionChannels,
      knownCompetitors: product.knownCompetitors,
      rawJson: product.rawJson,
    }));

    return {
      companyId: company.companyId,
      companyName: company.companyName,
      website: company.website,

      documents: this.safeJson(company.documents, []),
      documentsAi,
      productInfor: this.safeJson(company.productInfor, []),
      products,

      partners,
      competitors,
    };
  }

  async createResearchCompany(params: {
    userId: number;
    name: string;
    url?: string;
    jobtitle?: string;
    focusOn?: string;
    uploadDocs?: any[];
    uploadDocsAi?: any[];
  }): Promise<ResearchCompanyEntity> {
    const now = new Date();

    const research = new ResearchCompanyEntity();

    research.userId = params.userId;
    research.companyName = params.name;
    research.website = params.url ?? null;
    research.role = params.jobtitle ?? null;
    research.focusOn = params.focusOn ?? null;
    research.uploadDocs = JSON.stringify(params.uploadDocs ?? []);
    research.uploadDocsAi = JSON.stringify(params.uploadDocsAi ?? []);
    research.createdAt = now;
    research.updatedAt = now;

    return this.researchCompanyRepo.save(research);
  }

  async findResearchCompany(
    researchCompanyId: number,
  ): Promise<ResearchCompanyEntity> {
    const research = await this.researchCompanyRepo.findOne({
      where: {
        researchCompanyId,
        deletedAt: IsNull(),
      },
      relations: {
        crawlData: true,
        comparisons: true,
        organizational: true,
        scores: true,
      },
    });

    if (!research) {
      throw new NotFoundException(
        `Research company not found ${researchCompanyId}`,
      );
    }

    return research;
  }

  async createCrawlData(params: {
    researchCompanyId: number;
    corporateInitiatives?: string;
    triggerEvents?: string;
    techStack?: string;
    financialCapacity?: string;
    domain?: string[];
    businessData?: Record<string, any>;
  }): Promise<CrawlDataEntity> {
    const crawl = new CrawlDataEntity();

    crawl.researchId = params.researchCompanyId;
    crawl.corporateInitiatives = params.corporateInitiatives ?? '';
    crawl.triggerEvents = params.triggerEvents ?? '';
    crawl.techStack = params.techStack ?? '';
    crawl.financialCapacity = params.financialCapacity ?? '';
    crawl.domain = JSON.stringify(params.domain ?? []);
    crawl.businessData = params.businessData ?? {};
    crawl.createdAt = new Date();

    return this.crawlDataRepo.save(crawl);
  }

  async updateCrawlData(params: {
    crawDataId: number;
    corporateInitiatives?: string;
    triggerEvents?: string;
    techStack?: string;
    financialCapacity?: string;
    domain?: string[];
    businessData?: Record<string, any>;
  }): Promise<CrawlDataEntity> {
    const crawl = await this.crawlDataRepo.findOne({
      where: {
        crawDataId: params.crawDataId,
      },
    });

    if (!crawl) {
      throw new NotFoundException(`CrawlData not found: ${params.crawDataId}`);
    }

    crawl.corporateInitiatives = params.corporateInitiatives ?? '';
    crawl.triggerEvents = params.triggerEvents ?? '';
    crawl.techStack = params.techStack ?? '';
    crawl.financialCapacity = params.financialCapacity ?? '';
    crawl.domain = JSON.stringify(params.domain ?? []);
    crawl.businessData = params.businessData ?? {};

    return this.crawlDataRepo.save(crawl);
  }

  async upsertThreeWhysMeddpic(params: {
    researchCompanyId: number;
    whyThis: string;
    whyUs: string;
    whyNow: string;
    meddics: Record<string, any>;
    detailLevel: string;
  }): Promise<ComparisonEntity> {
    const now = new Date();

    const existing = await this.comparisonRepo.findOne({
      where: {
        researchId: params.researchCompanyId,
      },
    });

    const comparison = existing ?? new ComparisonEntity();

    if (!existing) {
      comparison.researchId = params.researchCompanyId;
      comparison.createdAt = now;
    }

    comparison.whyThis = params.whyThis;
    comparison.whyUs = params.whyUs;
    comparison.whyNow = params.whyNow;
    comparison.meddics = params.meddics;
    comparison.detailLevel = params.detailLevel;
    comparison.status = 'completed';
    comparison.updatedAt = now;

    return this.comparisonRepo.save(comparison);
  }

  async upsertPartnerCompetitor(params: {
    researchCompanyId: number;
    comparePartner: any;
    compareEnemies: any;
    compareOverall: any;
  }): Promise<ComparisonEntity> {
    const now = new Date();

    const existing = await this.comparisonRepo.findOne({
      where: {
        researchId: params.researchCompanyId,
      },
    });

    const comparison = existing ?? new ComparisonEntity();

    if (!existing) {
      comparison.researchId = params.researchCompanyId;
      comparison.status = 'processing';
      comparison.createdAt = now;
    }

    comparison.comparePartner = params.comparePartner;
    comparison.compareEnemies = params.compareEnemies;
    comparison.compareOverall = params.compareOverall;
    comparison.updatedAt = now;

    return this.comparisonRepo.save(comparison);
  }

  async upsertResearchScore(params: {
    researchCompanyId: number;
    needFit?: number | null;
    needFitSummary?: string | null;
    solutionFit?: number | null;
    solutionFitSummary?: string | null;
    initiativeFit?: number | null;
    initiativeFitSummary?: string | null;
    executionFit?: number | null;
    executionFitSummary?: string | null;
    riskFit?: number | null;
    riskFitSummary?: string | null;
    overallScore?: number | null;
    summary?: string | null;
  }): Promise<ResearchScoreEntity> {
    const now = new Date();

    const existing = await this.researchScoreRepo.findOne({
      where: {
        researchCompanyId: params.researchCompanyId,
      },
    });

    const score = existing ?? new ResearchScoreEntity();

    if (!existing) {
      score.researchCompanyId = params.researchCompanyId;
      score.createdAt = now;
    }

    score.needFit = params.needFit ?? null;
    score.needFitSummary = params.needFitSummary ?? null;

    score.solutionFit = params.solutionFit ?? null;
    score.solutionFitSummary = params.solutionFitSummary ?? null;

    score.initiativeFit = params.initiativeFit ?? null;
    score.initiativeFitSummary = params.initiativeFitSummary ?? null;

    score.executionFit = params.executionFit ?? null;
    score.executionFitSummary = params.executionFitSummary ?? null;

    score.riskFit = params.riskFit ?? null;
    score.riskFitSummary = params.riskFitSummary ?? null;

    score.overallScore =
      params.overallScore === undefined || params.overallScore === null
        ? null
        : String(params.overallScore);

    score.summary = params.summary ?? null;
    score.updatedAt = now;

    return this.researchScoreRepo.save(score);
  }

  async saveContacts(params: {
    researchCompanyId: number;
    contacts: Array<{
      name?: string | null;
      role?: string | null;
      linkedin?: string | null;
      email?: string | null;
    }>;
  }): Promise<OrganizationalEntity[]> {
    const now = new Date();

    const rows = params.contacts.map((contact) => {
      const row = new OrganizationalEntity();

      row.researchId = params.researchCompanyId;
      row.name = contact.name ?? null;
      row.role = contact.role ?? null;
      row.linkedin = contact.linkedin ?? null;
      row.email = contact.email ?? null;
      row.createdAt = now;

      return row;
    });

    return this.organizationalRepo.save(rows);
  }

  private safeJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) {
      return fallback;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
}
