/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

import type Observable from '../network/RelayObservable';
import type RelayOperationTracker from '../store/RelayOperationTracker';
import type {SelectorStoreUpdater} from '../store/RelayStoreTypes';
import type {
  CacheConfig,
  DataID,
  Disposable,
  Variables,
} from './RelayRuntimeTypes';

/**
 * Arbitrary data e.g. received by a container as props.
 */
export type Props = {[key: string]: mixed};

/*
 * An individual cached graph object.
 */
export type Record = {[key: string]: mixed};

/**
 * A collection of records keyed by id.
 */
export type RecordMap = {[dataID: DataID]: ?Record};

/**
 * A selector defines the starting point for a traversal into the graph for the
 * purposes of targeting a subgraph.
 */
export type CNormalizationSelector<TNormalizationNode> = {
  dataID: DataID,
  node: TNormalizationNode,
  variables: Variables,
};
export type CReaderSelector<TReaderNode> = {
  dataID: DataID,
  node: TReaderNode,
  variables: Variables,
};

/**
 * A representation of a selector and its results at a particular point in time.
 */
export type CSnapshot<TReaderNode, TOwner> = CReaderSelector<TReaderNode> & {
  data: ?SelectorData,
  seenRecords: RecordMap,
  isMissingData: boolean,
  owner: TOwner | null,
};

/**
 * The results of a selector given a store/RecordSource.
 */
export type SelectorData = {[key: string]: mixed};

/**
 * The results of reading the results of a FragmentMap given some input
 * `Props`.
 */
export type FragmentSpecResults = {[key: string]: mixed};

/**
 * A utility for resolving and subscribing to the results of a fragment spec
 * (key -> fragment mapping) given some "props" that determine the root ID
 * and variables to use when reading each fragment. When props are changed via
 * `setProps()`, the resolver will update its results and subscriptions
 * accordingly. Internally, the resolver:
 * - Converts the fragment map & props map into a map of `Selector`s.
 * - Removes any resolvers for any props that became null.
 * - Creates resolvers for any props that became non-null.
 * - Updates resolvers with the latest props.
 */
export interface CFragmentSpecResolver<TRequest> {
  /**
   * Stop watching for changes to the results of the fragments.
   */
  dispose(): void;

  /**
   * Get the current results.
   */
  resolve(): FragmentSpecResults;

  /**
   * Update the resolver with new inputs. Call `resolve()` to get the updated
   * results.
   */
  setProps(props: Props): void;

  /**
   * Override the variables used to read the results of the fragments. Call
   * `resolve()` to get the updated results.
   */
  setVariables(variables: Variables, node?: TRequest): void;

  /**
   * Subscribe to resolver updates.
   * Overrides existing callback (if one has been specified).
   */
  setCallback(callback: () => void): void;
}

export type CFragmentMap<TFragment> = {[key: string]: TFragment};

/**
 * An operation selector describes a specific instance of a GraphQL operation
 * with variables applied.
 *
 * - `root`: a selector intended for processing server results or retaining
 *   response data in the store.
 * - `fragment`: a selector intended for use in reading or subscribing to
 *   the results of the the operation.
 */
export type COperationDescriptor<TReaderNode, TNormalizationNode, TRequest> = {|
  +fragment: CReaderSelector<TReaderNode>,
  +node: TRequest,
  +root: CNormalizationSelector<TNormalizationNode>,
  +variables: Variables,
|};

/**
 * The public API of Relay core. Represents an encapsulated environment with its
 * own in-memory cache.
 */
export interface CEnvironment<
  TEnvironment,
  TFragment,
  TGraphQLTaggedNode,
  TReaderNode,
  TNormalizationNode,
  TRequest,
  TPayload,
  TReaderSelector,
> {
  /**
   * Determine if the selector can be resolved with data in the store (i.e. no
   * fields are missing).
   *
   * Note that this operation effectively "executes" the selector against the
   * cache and therefore takes time proportional to the size/complexity of the
   * selector.
   */
  check(selector: CNormalizationSelector<TNormalizationNode>): boolean;

  /**
   * Read the results of a selector from in-memory records in the store.
   */
  lookup(
    selector: CReaderSelector<TReaderNode>,
    owner: ?COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>,
  ): CSnapshot<
    TReaderNode,
    COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>,
  >;

  /**
   * Subscribe to changes to the results of a selector. The callback is called
   * when data has been committed to the store that would cause the results of
   * the snapshot's selector to change.
   */
  subscribe(
    snapshot: CSnapshot<
      TReaderNode,
      COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>,
    >,
    callback: (
      snapshot: CSnapshot<
        TReaderNode,
        COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>,
      >,
    ) => void,
  ): Disposable;

  /**
   * Ensure that all the records necessary to fulfill the given selector are
   * retained in-memory. The records will not be eligible for garbage collection
   * until the returned reference is disposed.
   *
   * Note: This is a no-op in the classic core.
   */
  retain(selector: CNormalizationSelector<TNormalizationNode>): Disposable;

  /**
   * Send a query to the server with Observer semantics: one or more
   * responses may be returned (via `next`) over time followed by either
   * the request completing (`completed`) or an error (`error`).
   *
   * Networks/servers that support subscriptions may choose to hold the
   * subscription open indefinitely such that `complete` is not called.
   *
   * Note: Observables are lazy, so calling this method will do nothing until
   * the result is subscribed to: environment.execute({...}).subscribe({...}).
   */
  execute(config: {|
    operation: COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>,
    cacheConfig?: ?CacheConfig,
    updater?: ?SelectorStoreUpdater,
  |}): Observable<TPayload>;

  unstable_internal: CUnstableEnvironmentCore<
    TEnvironment,
    TFragment,
    TGraphQLTaggedNode,
    TReaderNode,
    TNormalizationNode,
    TRequest,
    TReaderSelector,
  >;
}

export interface CUnstableEnvironmentCore<
  TEnvironment,
  TFragment,
  TGraphQLTaggedNode,
  TReaderNode,
  TNormalizationNode,
  TRequest,
  TReaderSelector,
> {
  /**
   * Create an instance of a CFragmentSpecResolver.
   *
   * TODO: The CFragmentSpecResolver *can* be implemented via the other methods
   * defined here, so this could be moved out of core. It's convenient to have
   * separate implementations until the experimental core is in OSS.
   */
  createFragmentSpecResolver: (
    context: CRelayContext<TEnvironment>,
    containerName: string,
    fragments: CFragmentMap<TFragment>,
    props: Props,
    callback?: () => void,
  ) => CFragmentSpecResolver<TRequest>;

  /**
   * Creates an instance of an OperationDescriptor given an operation definition
   * (see `getOperation`) and the variables to apply. The input variables are
   * filtered to exclude variables that do not match defined arguments on the
   * operation, and default values are populated for null values.
   */
  createOperationDescriptor: (
    request: TRequest,
    variables: Variables,
  ) => COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>;

  /**
   * Given a graphql`...` tagged template, extract a fragment definition usable
   * by this version of Relay core. Throws if the value is not a fragment.
   */
  getFragment: (node: TGraphQLTaggedNode) => TFragment;

  /**
   * Given a graphql`...` tagged template, extract an operation definition
   * usable by this version of Relay core. Throws if the value is not an
   * operation (or batch request).
   */
  getRequest: (node: TGraphQLTaggedNode) => TRequest;

  /**
   * Given a graphql`...` tagged template, returns true if the value is a
   * fragment definition, or false otherwise.
   */
  isFragment: (node: TGraphQLTaggedNode) => boolean;

  /**
   * Given a graphql`...` tagged template, returns true if the value is an
   * operation or batch request (i.e. query), or false otherwise.
   */
  isRequest: (node: TGraphQLTaggedNode) => boolean;

  /**
   * Determine if two selectors are equal (represent the same selection). Note
   * that this function returns `false` when the two queries/fragments are
   * different objects, even if they select the same fields.
   */
  areEqualSelectors: (a: TReaderSelector, b: TReaderSelector) => boolean;

  /**
   * Given the result `item` from a parent that fetched `fragment`, creates a
   * selector that can be used to read the results of that fragment for that item.
   *
   * Example:
   *
   * Given two fragments as follows:
   *
   * ```
   * fragment Parent on User {
   *   id
   *   ...Child
   * }
   * fragment Child on User {
   *   name
   * }
   * ```
   *
   * And given some object `parent` that is the results of `Parent` for id "4",
   * the results of `Child` can be accessed by first getting a selector and then
   * using that selector to `lookup()` the results against the environment:
   *
   * ```
   * const childSelector = getSingularSelector(queryVariables, Child, parent);
   * const childData = environment.lookup(childSelector).data;
   * ```
   */
  getSingularSelector: (
    operationVariables: Variables,
    fragment: TFragment,
    prop: mixed,
    owner?: ?COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>,
  ) => ?TReaderSelector;

  /**
   * Given the result `items` from a parent that fetched `fragment`, creates a
   * selector that can be used to read the results of that fragment on those
   * items. This is similar to `getSingularSelector` but for "plural" fragments that
   * expect an array of results and therefore return an array of selectors.
   */
  getPluralSelector: (
    operationVariables: Variables,
    fragment: TFragment,
    props: Array<mixed>,
    owner?: Array<?COperationDescriptor<
      TReaderNode,
      TNormalizationNode,
      TRequest,
    >>,
  ) => ?Array<TReaderSelector>;

  /**
   * Given an item (fragment ref) and a fragment, returns a singular selector
   * or array of selectors, depending on whether the fragment is singular or
   * plural.
   */
  getSelector: (
    operationVariables: Variables,
    fragment: TFragment,
    item: mixed | Array<mixed>,
    owner?:
      | ?COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>
      | Array<?COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>>,
  ) => ?TReaderSelector | ?Array<TReaderSelector>;

  /**
   * Given a mapping of keys -> results and a mapping of keys -> fragments,
   * extracts the selectors for those fragments from the results.
   *
   * The canonical use-case for this function are Relay Containers, which
   * use this function to convert (props, fragments) into selectors so that they
   * can read the results to pass to the inner component.
   */
  getSelectorsFromObject: (
    operationVariables: Variables,
    fragments: CFragmentMap<TFragment>,
    props: Props,
    owner?: {
      [key: string]:
        | ?COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>
        | Array<?COperationDescriptor<
            TReaderNode,
            TNormalizationNode,
            TRequest,
          >>,
    },
  ) => {
    [key: string]: ?(TReaderSelector | Array<TReaderSelector>),
  };

  /**
   * Given a mapping of keys -> results and a mapping of keys -> fragments,
   * extracts a mapping of keys -> id(s) of the results.
   *
   * Similar to `getSelectorsFromObject()`, this function can be useful in
   * determining the "identity" of the props passed to a component.
   */
  getDataIDsFromObject: (
    fragments: CFragmentMap<TFragment>,
    props: Props,
  ) => {[key: string]: ?(DataID | Array<DataID>)};

  getDataIDsFromFragment: (
    fragment: TFragment,
    prop: mixed,
  ) => ?DataID | ?Array<DataID>;

  getVariablesFromSingularFragment: (
    operationVariables: Variables,
    fragment: TFragment,
    prop: mixed,
    owner?: ?COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>,
  ) => ?Variables;

  getVariablesFromPluralFragment: (
    operationVariables: Variables,
    fragment: TFragment,
    prop: Array<mixed>,
    owners?: Array<?COperationDescriptor<
      TReaderNode,
      TNormalizationNode,
      TRequest,
    >>,
  ) => Variables;

  /**
   * Given an item (fragment ref) and a plural or singular fragment, extracts
   * and returns the merged variables that would be in scope for that fragment/item.
   */
  getVariablesFromFragment: (
    operationVariables: Variables,
    fragment: TFragment,
    item: mixed | Array<mixed>,
    owner?:
      | ?COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>
      | Array<?COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>>,
  ) => Variables;

  /**
   * Given a mapping of keys -> results and a mapping of keys -> fragments,
   * extracts the merged variables that would be in scope for those
   * fragments/results.
   *
   * This can be useful in determining what variables were used to fetch the data
   * for a Relay container, for example.
   */
  getVariablesFromObject: (
    operationVariables: Variables,
    fragments: CFragmentMap<TFragment>,
    props: Props,
    owners?: {
      [key: string]:
        | ?COperationDescriptor<TReaderNode, TNormalizationNode, TRequest>
        | Array<?COperationDescriptor<
            TReaderNode,
            TNormalizationNode,
            TRequest,
          >>,
    },
  ) => Variables;

  /**
   * Experimental operation tracker
   */
  getOperationTracker: () => ?RelayOperationTracker;
}

/**
 * The type of the `relay` property set on React context by the React/Relay
 * integration layer (e.g. QueryRenderer, FragmentContainer, etc).
 */
export type CRelayContext<TEnvironment> = {
  environment: TEnvironment,
  variables: Variables,
};
