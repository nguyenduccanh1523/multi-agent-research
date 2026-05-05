import { AgentType } from '../common/enums/agent-type.enum';
import { ResearchTool } from '../common/enums/research-tool.enum';

export interface ResearchPipelineGraphNode {
  agentType: AgentType;
  dependsOn: AgentType[];
  required: boolean;
  maxRetries: number;
}

const SELECTABLE_TOOL_TO_AGENT: Record<
  Exclude<ResearchTool, ResearchTool.ALL>,
  AgentType
> = {
  [ResearchTool.THREE_WHYS_MEDDPIC]: AgentType.THREE_WHYS_MEDDPIC,
  [ResearchTool.PARTNER_COMPETITOR]: AgentType.PARTNER_COMPETITOR,
  [ResearchTool.SCORING]: AgentType.SCORING,
  [ResearchTool.CONTACT_ENRICHMENT]: AgentType.CONTACT_ENRICHMENT,
};

const ALL_SELECTABLE_AGENT_TYPES: AgentType[] = [
  AgentType.THREE_WHYS_MEDDPIC,
  AgentType.PARTNER_COMPETITOR,
  AgentType.SCORING,
  AgentType.CONTACT_ENRICHMENT,
];

export function normalizeSelectedAgentTypes(
  selectedTools?: ResearchTool[],
): AgentType[] {
  const tools = selectedTools?.length ? selectedTools : [ResearchTool.ALL];

  if (tools.includes(ResearchTool.ALL)) {
    return ALL_SELECTABLE_AGENT_TYPES;
  }

  const agentTypes = tools
    .map(
      (tool) =>
        SELECTABLE_TOOL_TO_AGENT[
          tool as Exclude<ResearchTool, ResearchTool.ALL>
        ],
    )
    .filter(Boolean);

  return Array.from(new Set(agentTypes));
}

export function buildResearchPipelineGraph(
  selectedTools?: ResearchTool[],
): ResearchPipelineGraphNode[] {
  const selectedAgentTypes = normalizeSelectedAgentTypes(selectedTools);

  const nodes: ResearchPipelineGraphNode[] = [
    {
      agentType: AgentType.COMPANY_PROFILE_DB,
      dependsOn: [],
      required: true,
      maxRetries: 1,
    },
    {
      agentType: AgentType.COMPANY_RESEARCH_OVERVIEW,
      dependsOn: [],
      required: true,
      maxRetries: 1,
    },
  ];

  if (selectedAgentTypes.includes(AgentType.THREE_WHYS_MEDDPIC)) {
    nodes.push({
      agentType: AgentType.THREE_WHYS_MEDDPIC,
      dependsOn: [
        AgentType.COMPANY_PROFILE_DB,
        AgentType.COMPANY_RESEARCH_OVERVIEW,
      ],
      required: true,
      maxRetries: 2,
    });
  }

  if (selectedAgentTypes.includes(AgentType.PARTNER_COMPETITOR)) {
    nodes.push({
      agentType: AgentType.PARTNER_COMPETITOR,
      dependsOn: [
        AgentType.COMPANY_PROFILE_DB,
        AgentType.COMPANY_RESEARCH_OVERVIEW,
      ],
      required: true,
      maxRetries: 2,
    });
  }

  if (selectedAgentTypes.includes(AgentType.SCORING)) {
    nodes.push({
      agentType: AgentType.SCORING,
      dependsOn: [
        AgentType.COMPANY_PROFILE_DB,
        AgentType.COMPANY_RESEARCH_OVERVIEW,
      ],
      required: true,
      maxRetries: 1,
    });
  }

  if (selectedAgentTypes.includes(AgentType.CONTACT_ENRICHMENT)) {
    nodes.push({
      agentType: AgentType.CONTACT_ENRICHMENT,
      dependsOn: [AgentType.COMPANY_RESEARCH_OVERVIEW],
      required: false,
      maxRetries: 2,
    });
  }

  return nodes;
}
