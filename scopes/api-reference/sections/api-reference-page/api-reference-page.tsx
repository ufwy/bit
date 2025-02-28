import React, { useContext, useState, HTMLAttributes, useMemo } from 'react';
import flatten from 'lodash.flatten';
import classNames from 'classnames';
import { ComponentContext } from '@teambit/component';
import { H1 } from '@teambit/documenter.ui.heading';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { useLocation, Link } from '@teambit/base-react.navigation.link';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useSchema } from '@teambit/api-reference.hooks.use-schema';
import { APIReferenceExplorer } from '@teambit/api-reference.explorer.api-reference-explorer';
import { useAPIRefParam } from '@teambit/api-reference.hooks.use-api-ref-url';
import { APINodeRendererSlot } from '@teambit/api-reference';
import { sortAPINodes } from '@teambit/api-reference.utils.sort-api-nodes';
import { TreeNode } from '@teambit/design.ui.tree';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { EmptyBox } from '@teambit/design.ui.empty-box';

import styles from './api-reference-page.module.scss';

export type APIRefPageProps = {
  host: string;
  rendererSlot: APINodeRendererSlot;
} & HTMLAttributes<HTMLDivElement>;

export function APIRefPage({ host, rendererSlot, className }: APIRefPageProps) {
  const component = useContext(ComponentContext);
  const renderers = flatten(rendererSlot.values());
  const { apiModel, loading } = useSchema(host, component.id.toString(), renderers);
  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  const selectedAPIFromUrl = useAPIRefParam('selectedAPI');

  const apiNodes = (apiModel && flatten(Array.from(apiModel.apiByType.values())).sort(sortAPINodes)) || [];

  const isEmpty = apiNodes.length === 0;

  const apiTree: string[] = useMemo(() => {
    return apiNodes.map((apiNode) => {
      return `${apiNode.renderer?.nodeType}/${apiNode.api.name}`;
    });
  }, [apiNodes]);

  const getIcon = (node: TreeNode) => {
    const nodeType = node.id.split('/')[0];
    const icon = apiModel?.apiByType.get(nodeType)?.[0].renderer.icon?.url;
    return icon;
  };

  const selectedAPINode = (selectedAPIFromUrl && apiModel?.apiByName.get(selectedAPIFromUrl)) || apiNodes[0];

  const selectedAPIName =
    (selectedAPINode && `${selectedAPINode?.renderer?.nodeType}/${selectedAPINode?.api.name}`) || apiTree[0];

  const SelectedAPIComponent = selectedAPINode && selectedAPINode.renderer.Component;
  const location = useLocation();
  const query = useQuery();

  if (loading) {
    return (
      <div className={styles.loader}>
        <RoundLoader />
      </div>
    );
  }

  if (!apiModel || isEmpty) {
    return <EmptyBox title={'There is no API extracted for this component.'} link={''} linkText={''} />;
  }

  const icon = selectedAPINode.renderer.icon;
  const name = selectedAPINode.api.name;
  const componentVersionFromUrl = query.get('version');
  const filePath = selectedAPINode.api.location.filePath;
  const pathname = location?.pathname;
  const componentUrlWithoutVersion = pathname?.split('~')[0];
  const locationUrl = `${componentUrlWithoutVersion}~code/${filePath}${
    componentVersionFromUrl ? `?version=${componentVersionFromUrl}` : ''
  }`;

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={classNames(className, styles.apiRefPageContainer)}>
      <Pane className={styles.left}>
        <div className={styles.selectedAPIDetailsContainer}>
          <div className={styles.apiNodeDetailsNameContainer}>
            {icon && (
              <div className={styles.apiTypeIcon}>
                <img src={icon.url} />
              </div>
            )}
            <H1 size={'md'} className={styles.name}>
              {name}
            </H1>
            <SelectedAPILocation locationUrl={locationUrl} />
          </div>
          {SelectedAPIComponent && (
            <SelectedAPIComponent apiNode={selectedAPINode} apiRefModel={apiModel} renderers={renderers} depth={0} />
          )}
        </div>
      </Pane>
      <HoverSplitter className={styles.splitter}>
        <Collapser
          placement="left"
          isOpen={isSidebarOpen}
          onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
          onClick={() => setSidebarOpenness((x) => !x)}
          tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} file tree`}
          className={styles.collapser}
        />
      </HoverSplitter>
      <Pane className={classNames(styles.right, styles.dark)}>
        <APIReferenceExplorer selectedAPIName={selectedAPIName} apiTree={apiTree} getIcon={getIcon} />
      </Pane>
    </SplitPane>
  );
}

function SelectedAPILocation({ locationUrl }: { locationUrl: string }) {
  return (
    <Link external={true} href={locationUrl} className={styles.locationLink}>
      <div className={styles.locationLabel}>View Code</div>
      <div className={styles.locationIcon}>
        <img src="https://static.bit.dev/design-system-assets/Icons/external-link.svg"></img>
      </div>
    </Link>
  );
}
