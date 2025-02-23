import { Component, ComponentMap } from '@teambit/component';
import type { ExecutionContext, Environment } from '@teambit/envs';
import { PreviewDefinition } from '@teambit/preview';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';

import { CompositionsMain } from './compositions.main.runtime';
import { CompositionBrowserMetadataObject } from './composition';

export class CompositionPreviewDefinition implements PreviewDefinition {
  readonly prefix = 'compositions';
  readonly includePeers = true;

  constructor(private compositions: CompositionsMain) {}

  async renderTemplatePath(context: ExecutionContext): Promise<string> {
    return this.renderTemplatePathByEnv(context.env);
  }

  async renderTemplatePathByEnv(env: Environment) {
    return env.getMounter();
  }

  async getModuleMap(components: Component[]): Promise<ComponentMap<AbstractVinyl[]>> {
    const map = this.compositions.getPreviewFiles(components);
    return map;
  }

  async getMetadata(component: Component): Promise<CompositionBrowserMetadataObject> {
    const compositions = this.compositions
      .getCompositions(component)
      .map((composition) => ({ displayName: composition.displayName, identifier: composition.identifier }));
    return {
      compositions,
    };
  }
}
