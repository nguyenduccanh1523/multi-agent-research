import { Injectable } from '@nestjs/common';

import { AgentTaskStatus } from '../common/enums/agent-task-status.enum';
import { ResearchAgentTaskRecord } from './types/pipeline-records.types';

@Injectable()
export class DependencyResolverService {
  resolveReadyTasks(
    tasks: ResearchAgentTaskRecord[],
  ): ResearchAgentTaskRecord[] {
    return tasks.filter((task) => {
      if (
        task.status !== AgentTaskStatus.PENDING &&
        task.status !== AgentTaskStatus.RETRYING
      ) {
        return false;
      }

      return this.areDependenciesResolved(task, tasks);
    });
  }

  hasFatalFailure(tasks: ResearchAgentTaskRecord[]): boolean {
    return tasks.some(
      (task) => task.required && task.status === AgentTaskStatus.FAILED,
    );
  }

  private areDependenciesResolved(
    task: ResearchAgentTaskRecord,
    allTasks: ResearchAgentTaskRecord[],
  ): boolean {
    if (!task.dependsOn.length) {
      return true;
    }

    return task.dependsOn.every((dependencyAgentType) => {
      const dependencyTask = allTasks.find(
        (item) => item.agentType === dependencyAgentType,
      );

      if (!dependencyTask) {
        return false;
      }

      if (dependencyTask.status === AgentTaskStatus.SUCCEEDED) {
        return true;
      }

      if (
        !dependencyTask.required &&
        dependencyTask.status === AgentTaskStatus.FAILED
      ) {
        return true;
      }

      if (
        !dependencyTask.required &&
        dependencyTask.status === AgentTaskStatus.SKIPPED
      ) {
        return true;
      }

      return false;
    });
  }
}
