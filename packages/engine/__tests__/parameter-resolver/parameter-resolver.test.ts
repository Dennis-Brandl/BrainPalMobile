import { describe, it, expect, beforeEach } from 'vitest';
import { ScopeResolver } from '../../src/parameter-resolver/scope-resolver';
import { ParameterResolver } from '../../src/parameter-resolver/parameter-resolver';
import {
  InMemoryValuePropertyRepository,
  InMemoryWorkflowRepository,
} from '../helpers/mock-repositories';
import type { ParameterSpecification, OutputParameterSpecification } from '../../src/types/master';
import type { RuntimeWorkflow } from '../../src/types/runtime';

describe('ScopeResolver', () => {
  let valuePropertyRepo: InMemoryValuePropertyRepository;
  let workflowRepo: InMemoryWorkflowRepository;
  let scopeResolver: ScopeResolver;

  beforeEach(() => {
    valuePropertyRepo = new InMemoryValuePropertyRepository();
    workflowRepo = new InMemoryWorkflowRepository();
    scopeResolver = new ScopeResolver(valuePropertyRepo, workflowRepo);
  });

  function makeWorkflow(overrides: Partial<RuntimeWorkflow> & { instance_id: string }): RuntimeWorkflow {
    return {
      master_workflow_oid: 'master-1',
      master_workflow_version: '1.0',
      workflow_state: 'RUNNING',
      specification_json: '{}',
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      parent_workflow_instance_id: null,
      parent_step_oid: null,
      last_activity_at: null,
      ...overrides,
    };
  }

  it('should find property in workflow scope', async () => {
    await workflowRepo.save(makeWorkflow({ instance_id: 'wf-1' }));
    await valuePropertyRepo.upsertEntry('workflow', 'wf-1', 'Temperature', 'Value', '180');

    const result = await scopeResolver.lookupProperty('wf-1', 'Temperature', 'Value');
    expect(result).toBe('180');
  });

  it('should return null when property not found at any scope', async () => {
    await workflowRepo.save(makeWorkflow({ instance_id: 'wf-1' }));

    const result = await scopeResolver.lookupProperty('wf-1', 'NonExistent', 'Value');
    expect(result).toBeNull();
  });

  it('should find property in environment scope when not in workflow', async () => {
    await workflowRepo.save(makeWorkflow({ instance_id: 'wf-1' }));
    await valuePropertyRepo.upsertEntry('environment', 'env-1', 'GlobalConfig', 'Timeout', '30');

    const result = await scopeResolver.lookupProperty('wf-1', 'GlobalConfig', 'Timeout', 'env-1');
    expect(result).toBe('30');
  });

  it('should prefer workflow scope over environment scope', async () => {
    await workflowRepo.save(makeWorkflow({ instance_id: 'wf-1' }));
    await valuePropertyRepo.upsertEntry('workflow', 'wf-1', 'SharedProp', 'Value', 'workflow-value');
    await valuePropertyRepo.upsertEntry('environment', 'env-1', 'SharedProp', 'Value', 'env-value');

    const result = await scopeResolver.lookupProperty('wf-1', 'SharedProp', 'Value', 'env-1');
    expect(result).toBe('workflow-value');
  });

  it('should traverse parent workflow chain', async () => {
    // grandparent -> parent -> child
    await workflowRepo.save(makeWorkflow({ instance_id: 'grandparent-wf' }));
    await workflowRepo.save(makeWorkflow({
      instance_id: 'parent-wf',
      parent_workflow_instance_id: 'grandparent-wf',
    }));
    await workflowRepo.save(makeWorkflow({
      instance_id: 'child-wf',
      parent_workflow_instance_id: 'parent-wf',
    }));

    // Property only exists in grandparent
    await valuePropertyRepo.upsertEntry('workflow', 'grandparent-wf', 'InheritedProp', 'Value', 'from-grandparent');

    const result = await scopeResolver.lookupProperty('child-wf', 'InheritedProp', 'Value');
    expect(result).toBe('from-grandparent');
  });

  it('should prefer parent workflow scope over environment scope', async () => {
    await workflowRepo.save(makeWorkflow({ instance_id: 'parent-wf' }));
    await workflowRepo.save(makeWorkflow({
      instance_id: 'child-wf',
      parent_workflow_instance_id: 'parent-wf',
    }));

    await valuePropertyRepo.upsertEntry('workflow', 'parent-wf', 'Config', 'Value', 'parent-value');
    await valuePropertyRepo.upsertEntry('environment', 'env-1', 'Config', 'Value', 'env-value');

    const result = await scopeResolver.lookupProperty('child-wf', 'Config', 'Value', 'env-1');
    expect(result).toBe('parent-value');
  });

  it('should fall through to environment when not in workflow or parent chain', async () => {
    await workflowRepo.save(makeWorkflow({ instance_id: 'parent-wf' }));
    await workflowRepo.save(makeWorkflow({
      instance_id: 'child-wf',
      parent_workflow_instance_id: 'parent-wf',
    }));

    // Property only in environment
    await valuePropertyRepo.upsertEntry('environment', 'env-1', 'EnvOnly', 'Setting', 'env-setting');

    const result = await scopeResolver.lookupProperty('child-wf', 'EnvOnly', 'Setting', 'env-1');
    expect(result).toBe('env-setting');
  });

  it('should return null when entry name does not match', async () => {
    await workflowRepo.save(makeWorkflow({ instance_id: 'wf-1' }));
    await valuePropertyRepo.upsertEntry('workflow', 'wf-1', 'Prop', 'EntryA', 'value-a');

    const result = await scopeResolver.lookupProperty('wf-1', 'Prop', 'EntryB');
    expect(result).toBeNull();
  });
});

describe('ParameterResolver', () => {
  let valuePropertyRepo: InMemoryValuePropertyRepository;
  let workflowRepo: InMemoryWorkflowRepository;
  let scopeResolver: ScopeResolver;
  let resolver: ParameterResolver;

  beforeEach(() => {
    valuePropertyRepo = new InMemoryValuePropertyRepository();
    workflowRepo = new InMemoryWorkflowRepository();
    scopeResolver = new ScopeResolver(valuePropertyRepo, workflowRepo);
    resolver = new ParameterResolver(scopeResolver, valuePropertyRepo);
  });

  function makeWorkflow(id: string): RuntimeWorkflow {
    return {
      instance_id: id,
      master_workflow_oid: 'master-1',
      master_workflow_version: '1.0',
      workflow_state: 'RUNNING',
      specification_json: '{}',
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      parent_workflow_instance_id: null,
      parent_step_oid: null,
      last_activity_at: null,
    };
  }

  describe('resolveInputs', () => {
    it('should resolve literal parameters using default_value directly', async () => {
      await workflowRepo.save(makeWorkflow('wf-1'));

      const params: ParameterSpecification[] = [
        { id: 'param-1', default_value: 'hello world', value_type: 'literal' },
        { id: 'param-2', default_value: '42', value_type: 'literal' },
      ];

      const result = await resolver.resolveInputs('wf-1', params);

      expect(result.errors).toHaveLength(0);
      expect(result.resolved).toHaveLength(2);
      expect(result.resolved[0]).toEqual({
        id: 'param-1',
        value: 'hello world',
        source: 'literal',
      });
      expect(result.resolved[1]).toEqual({
        id: 'param-2',
        value: '42',
        source: 'literal',
      });
    });

    it('should resolve property parameters by looking up value from repository', async () => {
      await workflowRepo.save(makeWorkflow('wf-1'));
      await valuePropertyRepo.upsertEntry('workflow', 'wf-1', 'GarlicResponse', 'Value', '6');

      const params: ParameterSpecification[] = [
        { id: 'param-1', default_value: 'GarlicResponse.Value', value_type: 'property' },
      ];

      const result = await resolver.resolveInputs('wf-1', params);

      expect(result.errors).toHaveLength(0);
      expect(result.resolved).toHaveLength(1);
      expect(result.resolved[0]).toEqual({
        id: 'param-1',
        value: '6',
        source: 'property',
        property_name: 'GarlicResponse',
        entry_name: 'Value',
      });
    });

    it('should default entry name to "Value" when no dot in reference', async () => {
      await workflowRepo.save(makeWorkflow('wf-1'));
      await valuePropertyRepo.upsertEntry('workflow', 'wf-1', 'SimpleProp', 'Value', 'simple');

      const params: ParameterSpecification[] = [
        { id: 'param-1', default_value: 'SimpleProp', value_type: 'property' },
      ];

      const result = await resolver.resolveInputs('wf-1', params);

      expect(result.resolved[0].value).toBe('simple');
      expect(result.resolved[0].property_name).toBe('SimpleProp');
      expect(result.resolved[0].entry_name).toBe('Value');
    });

    it('should fall back to default_value when property lookup returns null', async () => {
      await workflowRepo.save(makeWorkflow('wf-1'));

      const params: ParameterSpecification[] = [
        { id: 'param-1', default_value: 'Missing.Entry', value_type: 'property' },
      ];

      const result = await resolver.resolveInputs('wf-1', params);

      expect(result.errors).toHaveLength(0);
      expect(result.resolved[0].value).toBe('Missing.Entry');
      expect(result.resolved[0].source).toBe('property');
    });

    it('should resolve property from environment scope via scope chain', async () => {
      await workflowRepo.save(makeWorkflow('wf-1'));
      await valuePropertyRepo.upsertEntry('environment', 'env-1', 'EnvConfig', 'Timeout', '30');

      const params: ParameterSpecification[] = [
        { id: 'param-1', default_value: 'EnvConfig.Timeout', value_type: 'property' },
      ];

      const result = await resolver.resolveInputs('wf-1', params, 'env-1');

      expect(result.resolved[0].value).toBe('30');
    });

    it('should resolve through parent workflow chain', async () => {
      await workflowRepo.save({
        ...makeWorkflow('parent-wf'),
      });
      await workflowRepo.save({
        ...makeWorkflow('child-wf'),
        parent_workflow_instance_id: 'parent-wf',
      });
      await valuePropertyRepo.upsertEntry('workflow', 'parent-wf', 'ParentData', 'Count', '5');

      const params: ParameterSpecification[] = [
        { id: 'param-1', default_value: 'ParentData.Count', value_type: 'property' },
      ];

      const result = await resolver.resolveInputs('child-wf', params);

      expect(result.resolved[0].value).toBe('5');
    });

    it('should handle mixed literal and property parameters', async () => {
      await workflowRepo.save(makeWorkflow('wf-1'));
      await valuePropertyRepo.upsertEntry('workflow', 'wf-1', 'Data', 'Result', 'resolved');

      const params: ParameterSpecification[] = [
        { id: 'p1', default_value: 'static text', value_type: 'literal' },
        { id: 'p2', default_value: 'Data.Result', value_type: 'property' },
        { id: 'p3', default_value: '100', value_type: 'literal' },
      ];

      const result = await resolver.resolveInputs('wf-1', params);

      expect(result.errors).toHaveLength(0);
      expect(result.resolved[0].value).toBe('static text');
      expect(result.resolved[1].value).toBe('resolved');
      expect(result.resolved[2].value).toBe('100');
    });
  });

  describe('writeOutputs', () => {
    it('should upsert correct property name and entry name', async () => {
      await workflowRepo.save(makeWorkflow('wf-1'));

      const outputs: OutputParameterSpecification[] = [
        {
          id: 'out-1',
          default_value: '',
          value_type: 'property',
          target_property_name: 'OutputProp',
          target_entry_name: 'Result',
        },
        {
          id: 'out-2',
          default_value: '',
          value_type: 'property',
          target_property_name: 'OutputProp',
          target_entry_name: 'Status',
        },
      ];

      const resolvedValues = new Map<string, string>([
        ['out-1', 'value-1'],
        ['out-2', 'success'],
      ]);

      await resolver.writeOutputs('wf-1', outputs, resolvedValues);

      // Verify the properties were written
      const prop = await valuePropertyRepo.getWorkflowProperty('wf-1', 'OutputProp');
      expect(prop).not.toBeNull();
      expect(prop!.entries).toContainEqual({ name: 'Result', value: 'value-1' });
      expect(prop!.entries).toContainEqual({ name: 'Status', value: 'success' });
    });

    it('should skip outputs not present in resolvedValues map', async () => {
      await workflowRepo.save(makeWorkflow('wf-1'));

      const outputs: OutputParameterSpecification[] = [
        {
          id: 'out-1',
          default_value: '',
          value_type: 'property',
          target_property_name: 'Prop',
          target_entry_name: 'Entry',
        },
      ];

      // Empty map -- no resolved values
      const resolvedValues = new Map<string, string>();

      await resolver.writeOutputs('wf-1', outputs, resolvedValues);

      const prop = await valuePropertyRepo.getWorkflowProperty('wf-1', 'Prop');
      // Property should not have been created since no value was provided
      expect(prop).toBeNull();
    });

    it('should overwrite existing entries via upsert', async () => {
      await workflowRepo.save(makeWorkflow('wf-1'));
      // Pre-existing entry
      await valuePropertyRepo.upsertEntry('workflow', 'wf-1', 'Counter', 'Value', '0');

      const outputs: OutputParameterSpecification[] = [
        {
          id: 'out-1',
          default_value: '',
          value_type: 'property',
          target_property_name: 'Counter',
          target_entry_name: 'Value',
        },
      ];

      await resolver.writeOutputs('wf-1', outputs, new Map([['out-1', '42']]));

      const prop = await valuePropertyRepo.getWorkflowProperty('wf-1', 'Counter');
      expect(prop!.entries[0].value).toBe('42');
    });
  });
});
