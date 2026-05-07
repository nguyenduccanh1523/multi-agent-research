import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

export interface LinkedinContactResult {
  linkedin_url: string;
  type: 'profile';
  title?: string | null;
  snippet?: string | null;
  matched_by: string;
}

@Injectable()
export class ContactFinderService {
  private readonly logger = new Logger(ContactFinderService.name);

  private readonly serpApiEndpoint = 'https://serpapi.com/search.json';

  async findLinkedinMinCost(params: {
    companyName: string;
    companyUrl?: string | null;
    numResults?: number;
  }): Promise<LinkedinContactResult[]> {
    const serpApiKey = process.env.SERPAPI_KEY || process.env.SERPAPI;

    if (!serpApiKey) {
      throw new InternalServerErrorException('SERPAPI_KEY is missing in .env');
    }

    const companyName = params.companyName;
    const domain = this.extractDomain(params.companyUrl);

    const query = domain
      ? `site:linkedin.com/in ("${companyName}" OR "${domain}" OR "at ${companyName}")`
      : `site:linkedin.com/in ("${companyName}" OR "at ${companyName}")`;

    const url = new URL(this.serpApiEndpoint);
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', query);
    url.searchParams.set('api_key', serpApiKey);
    url.searchParams.set('num', String(params.numResults ?? 30));

    const response = await fetch(url.toString());

    if (!response.ok) {
      const text = await response.text();
      throw new InternalServerErrorException(
        `SerpAPI failed: ${response.status} ${text}`,
      );
    }

    const data = await response.json();
    const organicResults = data.organic_results ?? [];

    const results = new Map<string, LinkedinContactResult>();

    for (const item of organicResults) {
      const rawLink = item.link ?? item.linkedinUrl ?? '';
      const linkedinUrl = this.normalizeLinkedinToRoot(rawLink);

      if (!linkedinUrl || !linkedinUrl.includes('linkedin.com/in/')) {
        continue;
      }

      const title = String(item.title ?? '');
      const snippet = String(item.snippet ?? '');

      const isMatched = this.isExperienceMatch({
        companyName,
        domain,
        title,
        snippet,
      });

      if (!isMatched) {
        continue;
      }

      results.set(linkedinUrl, {
        linkedin_url: linkedinUrl,
        type: 'profile',
        title,
        snippet,
        matched_by: 'experience_inference',
      });
    }

    this.logger.log(
      `LinkedIn contacts found company="${companyName}", count=${results.size}`,
    );

    return Array.from(results.values());
  }

  private extractDomain(companyUrl?: string | null): string | null {
    if (!companyUrl) return null;

    try {
      const normalized = companyUrl.startsWith('http')
        ? companyUrl
        : `https://${companyUrl}`;

      const parsed = new URL(normalized);

      return parsed.hostname.replace('www.', '').toLowerCase();
    } catch {
      return companyUrl
        .replace('https://', '')
        .replace('http://', '')
        .replace('www.', '')
        .split('/')[0]
        .toLowerCase();
    }
  }

  private normalizeLinkedinToRoot(rawUrl: string): string {
    if (!rawUrl) return '';

    let raw = rawUrl.trim();

    if (raw.startsWith('//')) {
      raw = `https:${raw}`;
    } else if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
      raw = `https://${raw}`;
    }

    try {
      const parsed = new URL(raw);
      const path = `/${parsed.pathname.replace(/^\/+/, '')}`;

      if (!path.includes('/in/')) {
        return '';
      }

      return `https://linkedin.com${path.replace(/\/$/, '')}`;
    } catch {
      return '';
    }
  }

  private isExperienceMatch(params: {
    companyName: string;
    domain: string | null;
    title: string;
    snippet: string;
  }) {
    const companyName = params.companyName.toLowerCase();
    const domain = params.domain?.toLowerCase() ?? '';
    const title = params.title.toLowerCase();
    const snippet = params.snippet.toLowerCase();

    if (title.includes(companyName) || snippet.includes(companyName)) {
      return true;
    }

    if (domain && snippet.includes(domain)) {
      return true;
    }

    if (
      title.includes(`at ${companyName}`) ||
      snippet.includes(`at ${companyName}`)
    ) {
      return true;
    }

    return false;
  }
}
