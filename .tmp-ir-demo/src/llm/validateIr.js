const VAR_REF_RE = /^\$var:([A-Za-z0-9_.-]+)$/;
const VAR_NAME_RE = /^[A-Za-z0-9_.-]+$/;
export function validateIr(ir) {
    const issues = [];
    // Map: scopeKey -> varName -> decl
    const decls = new Map();
    for (let i = 0; i < ir.steps.length; i++) {
        const step = ir.steps[i];
        const scopeKey = scopeKeyOf(step.scope?.chartId);
        // 1) Validate all var references inside this step's params.
        for (const ref of findVarRefs(step.params, 'params')) {
            const { name, path } = ref;
            const scopeDecls = decls.get(scopeKey);
            const decl = scopeDecls?.get(name);
            if (!decl) {
                // Might exist in other scopes -> treat as scope mismatch if found elsewhere.
                const foundElsewhere = findDeclInAnyScope(decls, name);
                if (foundElsewhere) {
                    issues.push({
                        level: 'error',
                        code: 'var_ref_scope_mismatch',
                        stepId: step.id,
                        path,
                        message: `Variable "${name}" exists in scope "${foundElsewhere.scopeKey}" but was referenced in scope "${scopeKey}".`,
                    });
                }
                else {
                    issues.push({
                        level: 'error',
                        code: 'var_ref_unknown',
                        stepId: step.id,
                        path,
                        message: `Unknown variable "${name}". Add an earlier step that defines it (params.outVar) in the same scope.`,
                    });
                }
                continue;
            }
            if (decl.stepIndex >= i) {
                issues.push({
                    level: 'error',
                    code: 'var_ref_forward',
                    stepId: step.id,
                    path,
                    message: `Variable "${name}" is referenced before it is defined (defined at step index ${decl.stepIndex}).`,
                });
            }
        }
        // 2) Register var declarations from this step (params.outVar).
        const outVar = step.params?.outVar;
        if (typeof outVar === 'string' && outVar.length > 0) {
            if (!VAR_NAME_RE.test(outVar)) {
                issues.push({
                    level: 'error',
                    code: 'invalid_var_name',
                    stepId: step.id,
                    path: 'params.outVar',
                    message: `Invalid outVar name "${outVar}". Use only [A-Za-z0-9_.-].`,
                });
            }
            else {
                const scopeDecls = getOrInitScopeDecls(decls, scopeKey);
                if (scopeDecls.has(outVar)) {
                    const prev = scopeDecls.get(outVar);
                    issues.push({
                        level: 'warning',
                        code: 'var_decl_duplicate',
                        stepId: step.id,
                        path: 'params.outVar',
                        message: `Duplicate outVar "${outVar}" in scope "${scopeKey}". Previously defined in step "${prev.stepId}".`,
                    });
                }
                scopeDecls.set(outVar, {
                    stepIndex: i,
                    stepId: step.id,
                    scopeKey,
                    name: outVar,
                    valueType: valueTypeForStep(step.type),
                });
            }
        }
    }
    return issues;
}
function valueTypeForStep(type) {
    switch (type) {
        case 'average':
        case 'sum':
        case 'count':
        case 'diff':
            return 'number';
        case 'findExtremum':
        case 'nth':
            return 'items';
        default:
            return 'unknown';
    }
}
function scopeKeyOf(chartId) {
    return chartId && chartId.length > 0 ? `chart:${chartId}` : 'global';
}
function getOrInitScopeDecls(decls, scopeKey) {
    let scopeDecls = decls.get(scopeKey);
    if (!scopeDecls) {
        scopeDecls = new Map();
        decls.set(scopeKey, scopeDecls);
    }
    return scopeDecls;
}
function findDeclInAnyScope(decls, name) {
    for (const scopeDecls of decls.values()) {
        const hit = scopeDecls.get(name);
        if (hit)
            return hit;
    }
    return null;
}
function findVarRefs(value, path) {
    const out = [];
    if (typeof value === 'string') {
        const m = value.match(VAR_REF_RE);
        if (m)
            out.push({ name: m[1], path });
        return out;
    }
    if (!value || typeof value !== 'object')
        return out;
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            out.push(...findVarRefs(value[i], `${path}[${i}]`));
        }
        return out;
    }
    for (const [k, v] of Object.entries(value)) {
        out.push(...findVarRefs(v, `${path}.${k}`));
    }
    return out;
}
