import R from 'ramda';
import { isHash } from '@teambit/component-version';
import { LaneId } from '@teambit/lane-id';
import { BitId, BitIds } from '../../bit-id';
import { BuildStatus, DEFAULT_BINDINGS_PREFIX, DEFAULT_BUNDLE_FILENAME, Extensions } from '../../constants';
import ConsumerComponent from '../../consumer/component';
import { isSchemaSupport, SchemaFeature, SchemaName } from '../../consumer/component/component-schema';
import { Dependencies, Dependency } from '../../consumer/component/dependencies';
import { SourceFile } from '../../consumer/component/sources';
import { getRefsFromExtensions } from '../../consumer/component/sources/artifact-files';
import { ComponentOverridesData } from '../../consumer/config/component-overrides';
import { ExtensionDataEntry, ExtensionDataList } from '../../consumer/config/extension-data';
import { Doclet } from '../../jsdoc/types';
import logger from '../../logger/logger';
import { filterObject, first, getStringifyArgs } from '../../utils';
import { PathLinux } from '../../utils/path';
import VersionInvalid from '../exceptions/version-invalid';
import { BitObject, Ref } from '../objects';
import { ObjectItem } from '../objects/object-list';
import Repository from '../objects/repository';
import validateVersionInstance from '../version-validator';
import Source from './source';
import { getHarmonyVersion } from '../../bootstrap';

export type SourceFileModel = {
  name: string;
  relativePath: PathLinux;
  test: boolean;
  file: Ref;
};

export type DistFileModel = SourceFileModel;

export type ArtifactFileModel = {
  relativePath: PathLinux;
  file: Ref;
};

export type Log = {
  message: string;
  date: string;
  username: string | undefined;
  email: string | undefined;
};

type ExternalHead = { head: Ref; laneId: LaneId };
type SquashData = { previousParents: Ref[]; laneId: LaneId };

export type VersionProps = {
  mainFile: PathLinux;
  files: Array<SourceFileModel>;
  log: Log;
  docs?: Doclet[];
  dependencies?: Dependency[];
  devDependencies?: Dependency[];
  flattenedDependencies?: BitIds;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  packageDependencies?: { [key: string]: string };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  devPackageDependencies?: { [key: string]: string };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  peerPackageDependencies?: { [key: string]: string };
  bindingPrefix?: string;
  schema?: string;
  overrides: ComponentOverridesData;
  packageJsonChangedProps?: Record<string, any>;
  hash?: string;
  parents?: Ref[];
  squashed?: SquashData;
  unrelated?: ExternalHead;
  extensions?: ExtensionDataList;
  buildStatus?: BuildStatus;
  componentId?: BitId;
  bitVersion?: string;
};

/**
 * Represent a version model in the scope
 */
export default class Version extends BitObject {
  mainFile: PathLinux;
  files: Array<SourceFileModel>;
  log: Log;
  docs: Doclet[] | undefined;
  dependencies: Dependencies;
  devDependencies: Dependencies;
  flattenedDependencies: BitIds;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  packageDependencies: { [key: string]: string };
  devPackageDependencies: { [key: string]: string };
  peerPackageDependencies: { [key: string]: string };
  bindingPrefix: string | undefined;
  schema: string | undefined;
  overrides: ComponentOverridesData;
  packageJsonChangedProps: Record<string, any>;
  _hash: string; // reason for the underscore prefix is that we already have hash as a method
  parents: Ref[];
  squashed?: SquashData; // when a component is squashed during lane-merge
  unrelated?: ExternalHead; // when a component from a lane was created with the same name/scope as main, this ref points to the component of the lane
  extensions: ExtensionDataList;
  buildStatus?: BuildStatus;
  componentId?: BitId; // can help debugging errors when validating Version object
  bitVersion?: string;

  constructor(props: VersionProps) {
    super();
    this.mainFile = props.mainFile;
    this.files = props.files;
    this.log = props.log;
    this.dependencies = new Dependencies(props.dependencies);
    this.devDependencies = new Dependencies(props.devDependencies);
    this.docs = props.docs;
    this.flattenedDependencies = props.flattenedDependencies || new BitIds();
    this.packageDependencies = props.packageDependencies || {};
    this.devPackageDependencies = props.devPackageDependencies || {};
    this.peerPackageDependencies = props.peerPackageDependencies || {};
    this.bindingPrefix = props.bindingPrefix;
    this.schema = props.schema;
    this.overrides = props.overrides || {};
    this.packageJsonChangedProps = props.packageJsonChangedProps || {};
    // @ts-ignore yes, props.hash can be undefined here, but it gets populated as soon as Version is created
    this._hash = props.hash;
    this.parents = props.parents || [];
    this.squashed = props.squashed;
    this.unrelated = props.unrelated;
    this.extensions = props.extensions || ExtensionDataList.fromArray([]);
    this.buildStatus = props.buildStatus;
    this.componentId = props.componentId;
    this.bitVersion = props.bitVersion;
    this.validateVersion();
  }

  validateVersion() {
    const nonEmptyFields = ['mainFile', 'files'];
    nonEmptyFields.forEach((field) => {
      if (!this[field]) {
        throw new VersionInvalid(`failed creating a version object, the field "${field}" can't be empty`);
      }
    });
  }

  id() {
    const obj = this.toObject();

    // @todo: remove the entire dependencies.relativePaths from the ID (it's going to be a breaking change)
    const getDependencies = (deps: Dependencies) => {
      const clonedDependencies = deps.cloneAsString();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return clonedDependencies.map((dependency: Dependency) => {
        return {
          id: dependency.id,
          relativePaths: dependency.relativePaths.map((relativePath) => {
            return {
              sourceRelativePath: relativePath.sourceRelativePath,
              destinationRelativePath: relativePath.destinationRelativePath,
            };
          }),
        };
      });
    };

    const getExtensions = (extensions: ExtensionDataList) => {
      const sortedConfigOnly = extensions.sortById().toConfigArray();
      return sortedConfigOnly;
    };

    const filterFunction = (val, key) => {
      if (
        key === 'devDependencies' ||
        key === 'extensionDependencies' ||
        key === 'devPackageDependencies' ||
        key === 'peerPackageDependencies' ||
        key === 'overrides' ||
        key === 'extensions'
      ) {
        return !R.isEmpty(val);
      }
      return !!val;
    };

    return JSON.stringify(
      filterObject(
        {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          mainFile: obj.mainFile,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          files: obj.files,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          log: obj.log,
          dependencies: getDependencies(this.dependencies),
          devDependencies: getDependencies(this.devDependencies),
          extensionDependencies: getDependencies(this.extensionDependencies),
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          packageDependencies: obj.packageDependencies,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          devPackageDependencies: obj.devPackageDependencies,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          peerPackageDependencies: obj.peerPackageDependencies,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          bindingPrefix: obj.bindingPrefix,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          overrides: obj.overrides,
          extensions: getExtensions(this.extensions),
        },
        filterFunction
      )
    );
  }

  calculateHash(): Ref {
    return new Ref(BitObject.makeHash(this.id()));
  }

  hash(): Ref {
    if (!this._hash) {
      throw new Error('hash is missing from a Version object');
    }
    return new Ref(this._hash);
  }

  get extensionDependencies() {
    return new Dependencies(this.extensions.extensionsBitIds.map((id) => new Dependency(id, [])));
  }

  getAllFlattenedDependencies(): BitIds {
    return BitIds.fromArray([...this.flattenedDependencies]);
  }

  getAllDependencies(): Dependency[] {
    return [
      ...this.dependencies.dependencies,
      ...this.devDependencies.dependencies,
      ...this.extensionDependencies.dependencies,
    ];
  }

  get depsIdsGroupedByType(): { dependencies: BitIds; devDependencies: BitIds; extensionDependencies: BitIds } {
    return {
      dependencies: this.dependencies.getAllIds(),
      devDependencies: this.devDependencies.getAllIds(),
      extensionDependencies: this.extensions.extensionsBitIds,
    };
  }

  getAllDependenciesCloned(): Dependencies {
    const dependencies = [...this.dependencies.getClone(), ...this.devDependencies.getClone()];
    return new Dependencies(dependencies);
  }

  getAllDependenciesIds(): BitIds {
    const allDependencies = R.flatten(Object.values(this.depsIdsGroupedByType));
    return BitIds.fromArray(allDependencies);
  }

  getDependenciesIdsExcludeExtensions(): BitIds {
    return BitIds.fromArray([...this.dependencies.getAllIds(), ...this.devDependencies.getAllIds()]);
  }

  updateFlattenedDependency(currentId: BitId, newId: BitId) {
    const getUpdated = (flattenedDependencies: BitIds): BitIds => {
      const updatedIds = flattenedDependencies.map((depId) => {
        if (depId.isEqual(currentId)) return newId;
        return depId;
      });
      return BitIds.fromArray(updatedIds);
    };
    this.flattenedDependencies = getUpdated(this.flattenedDependencies);
  }

  refs(): Ref[] {
    return this.refsWithOptions();
  }

  refsWithOptions(includeParents = true, includeArtifacts = true): Ref[] {
    const allRefs: Ref[] = [];
    const extractRefsFromFiles = (files) => {
      const refs = files ? files.map((file) => file.file) : [];
      return refs;
    };
    const files = extractRefsFromFiles(this.files);
    allRefs.push(...files);
    if (includeParents) {
      allRefs.push(...this.parents);
    }
    if (includeArtifacts) {
      const artifacts = getRefsFromExtensions(this.extensions);
      allRefs.push(...artifacts);
    }
    return allRefs;
  }

  refsWithoutParents(): Ref[] {
    const extractRefsFromFiles = (files) => {
      const refs = files ? files.map((file) => file.file) : [];
      return refs;
    };
    const files = extractRefsFromFiles(this.files);
    const artifacts = getRefsFromExtensions(this.extensions);
    return [...files, ...artifacts].filter((ref) => ref);
  }

  async collectManyObjects(repo: Repository, refs: Ref[]): Promise<ObjectItem[]> {
    return repo.loadManyRaw(refs);
  }

  toObject() {
    const _convertFileToObject = (file) => {
      return {
        file: file.file.toString(),
        relativePath: file.relativePath,
        name: file.name,
        test: file.test,
      };
    };
    return filterObject(
      {
        files: this.files ? this.files.map(_convertFileToObject) : null,
        mainFile: this.mainFile,
        bindingPrefix: this.bindingPrefix || DEFAULT_BINDINGS_PREFIX,
        schema: this.schema,
        log: {
          message: this.log.message,
          date: this.log.date,
          username: this.log.username,
          email: this.log.email,
        },
        docs: this.docs,
        dependencies: this.dependencies.cloneAsObject(),
        devDependencies: this.devDependencies.cloneAsObject(),
        flattenedDependencies: this.flattenedDependencies.map((dep) => dep.serialize()),
        extensions: this.extensions.toModelObjects(),
        packageDependencies: this.packageDependencies,
        devPackageDependencies: this.devPackageDependencies,
        peerPackageDependencies: this.peerPackageDependencies,
        overrides: this.overrides,
        buildStatus: this.buildStatus,
        packageJsonChangedProps: this.packageJsonChangedProps,
        parents: this.parents.map((p) => p.toString()),
        squashed: this.squashed
          ? {
              previousParents: this.squashed.previousParents.map((p) => p.toString()),
              laneId: this.squashed.laneId.toObject(),
            }
          : undefined,
        unrelated: this.unrelated
          ? { head: this.unrelated.head.toString(), laneId: this.unrelated.laneId.toObject() }
          : undefined,
        bitVersion: this.bitVersion,
      },
      (val) => !!val
    );
  }

  validateBeforePersisting(versionStr: string): void {
    logger.trace(`validating version object, hash: ${this.hash().hash}`);
    const version = Version.parse(versionStr, this._hash);
    version.validate();
  }

  toBuffer(pretty: boolean): Buffer {
    const obj = this.toObject();
    const args = getStringifyArgs(pretty);
    const str = JSON.stringify(obj, ...args);
    if (this.validateBeforePersist) this.validateBeforePersisting(str);
    return Buffer.from(str);
  }
  /**
   * used by the super class BitObject
   */
  static parse(contents: string, hash: string): Version {
    const contentParsed = JSON.parse(contents);
    const {
      mainFile,
      files,
      bindingPrefix,
      schema,
      log,
      docs,
      dependencies,
      devDependencies,
      flattenedDependencies,
      flattenedDevDependencies,
      devPackageDependencies,
      peerPackageDependencies,
      packageDependencies,
      overrides,
      packageJsonChangedProps,
      extensions,
      buildStatus,
      parents,
      squashed,
      unrelated,
      bitVersion,
    } = contentParsed;

    const _getDependencies = (deps = []): Dependency[] => {
      if (deps.length && R.is(String, first(deps))) {
        // backward compatibility
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return deps.map((dependency) => ({ id: BitId.parseObsolete(dependency) }));
      }

      const getRelativePath = (relativePath) => {
        if (relativePath.importSpecifiers) {
          // backward compatibility. Before the massive validation was added, an item of
          // relativePath.importSpecifiers array could be missing the mainFile property, which is
          // an invalid ImportSpecifier. (instead the mainFile it had another importSpecifiers object).
          relativePath.importSpecifiers = relativePath.importSpecifiers.filter(
            (importSpecifier) => importSpecifier.mainFile
          );
          if (!relativePath.importSpecifiers.length) delete relativePath.importSpecifiers;
        }

        return relativePath;
      };

      return deps.map((dependency: any) => {
        return {
          id: BitId.parseBackwardCompatible(dependency.id),
          relativePaths: Array.isArray(dependency.relativePaths)
            ? dependency.relativePaths.map(getRelativePath)
            : dependency.relativePaths,
        };
      });
    };

    const _getFlattenedDependencies = (deps = []): BitId[] => {
      return deps.map((dep) => BitId.parseBackwardCompatible(dep));
    };

    const _groupFlattenedDependencies = () => {
      // support backward compatibility. until v15, there was both flattenedDependencies and
      // flattenedDevDependencies. since then, these both were grouped to one flattenedDependencies
      const flattenedDeps = _getFlattenedDependencies(flattenedDependencies);
      const flattenedDevDeps = _getFlattenedDependencies(flattenedDevDependencies);
      return BitIds.fromArray([...flattenedDeps, ...flattenedDevDeps]);
    };

    const parseFile = (file) => {
      return {
        file: Ref.from(file.file),
        relativePath: file.relativePath,
        name: file.name,
        test: file.test,
      };
    };
    const _getExtensions = (exts = []): ExtensionDataList => {
      if (exts.length) {
        const newExts = exts.map((extension: any) => {
          if (extension.extensionId) {
            const extensionId = new BitId(extension.extensionId);
            const entry = new ExtensionDataEntry(undefined, extensionId, undefined, extension.config, extension.data);
            return entry;
          }
          const entry = new ExtensionDataEntry(
            extension.id,
            undefined,
            extension.name,
            extension.config,
            extension.data
          );
          return entry;
        });
        return ExtensionDataList.fromModelObject(newExts);
      }
      return new ExtensionDataList();
    };

    return new Version({
      mainFile,
      files: files ? files.map(parseFile) : null,
      bindingPrefix: bindingPrefix || null,
      schema: schema || undefined,
      log: {
        message: log.message,
        date: log.date,
        username: log.username,
        email: log.email,
      },
      docs,
      dependencies: _getDependencies(dependencies),
      devDependencies: _getDependencies(devDependencies),
      flattenedDependencies: _groupFlattenedDependencies(),
      devPackageDependencies,
      peerPackageDependencies,
      packageDependencies,
      overrides,
      packageJsonChangedProps,
      hash,
      parents: parents ? parents.map((p) => Ref.from(p)) : [],
      squashed: squashed
        ? { previousParents: squashed.previousParents.map((r) => Ref.from(r)), laneId: new LaneId(squashed.laneId) }
        : undefined,
      unrelated: unrelated ? { head: Ref.from(unrelated.head), laneId: new LaneId(unrelated.laneId) } : undefined,
      extensions: _getExtensions(extensions),
      buildStatus,
      bitVersion,
    });
  }

  /**
   * used by raw-object.toRealObject()
   */
  static from(versionProps: VersionProps, hash: string): Version {
    return Version.parse(JSON.stringify(versionProps), hash);
  }

  /**
   * Create version model object from consumer component
   * @param {*} param0
   */
  static fromComponent({ component, files }: { component: ConsumerComponent; files: Array<SourceFileModel> }) {
    const parseFile = (file) => {
      return {
        file: file.file.hash(),
        relativePath: file.relativePath,
        name: file.name,
        test: file.test,
      };
    };

    if (!component.log) throw new Error('Version.fromComponent - component.log is missing');
    const version = new Version({
      mainFile: component.mainFile,
      files: files.map(parseFile),
      bindingPrefix: component.bindingPrefix,
      log: component.log as Log,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      docs: component.docs,
      dependencies: component.dependencies.get(),
      devDependencies: component.devDependencies.get(),
      packageDependencies: component.packageDependencies,
      devPackageDependencies: component.devPackageDependencies,
      peerPackageDependencies: component.peerPackageDependencies,
      flattenedDependencies: component.flattenedDependencies,
      schema: component.schema,
      overrides: component.overrides.componentOverridesData,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      packageJsonChangedProps: component.packageJsonChangedProps,
      extensions: component.extensions,
      buildStatus: component.buildStatus,
      componentId: component.id,
      bitVersion: getHarmonyVersion(true),
    });
    if (isHash(component.version)) {
      version._hash = component.version as string;
    } else {
      version.setNewHash();
    }

    return version;
  }

  setNewHash() {
    // @todo: after v15 is deployed, this can be changed to generate a random uuid
    this._hash = this.calculateHash().toString();
  }

  get ignoreSharedDir(): boolean {
    return !isSchemaSupport(SchemaFeature.sharedDir, this.schema);
  }

  get isLegacy(): boolean {
    return !this.schema || this.schema === SchemaName.Legacy;
  }

  setDist(dist: Source | undefined) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.dist = dist
      ? {
          file: dist.hash(),
          name: DEFAULT_BUNDLE_FILENAME,
        }
      : null;
  }

  hasParent(ref: Ref) {
    return this.parents.find((p) => p.toString() === ref.toString());
  }

  addParent(ref: Ref) {
    if (this.isLegacy) return;
    if (this.hasParent(ref)) {
      return; // make sure to not add twice
    }
    this.parents.push(ref);
  }

  setSquashed(squashData: SquashData) {
    this.squashed = squashData;
  }

  addAsOnlyParent(ref: Ref) {
    if (this.isLegacy) return;
    this.parents = [ref];
  }

  removeParent(ref: Ref) {
    this.parents = this.parents.filter((p) => p.toString() !== ref.toString());
  }

  modelFilesToSourceFiles(repository: Repository): Promise<SourceFile[]> {
    return Promise.all(this.files.map((file) => SourceFile.loadFromSourceFileModel(file, repository)));
  }

  isRemoved(): boolean {
    return Boolean(this.extensions.findCoreExtension(Extensions.remove)?.config?.removed);
  }

  /**
   * Validate the version model properties, to make sure we are not inserting something
   * in the wrong format
   */
  validate(): void {
    validateVersionInstance(this);
  }
}
