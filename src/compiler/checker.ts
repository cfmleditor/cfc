import { Diagnostic, SourceFile, Node, NodeType, BlockType, IndexedAccess, StatementType, CallExpression, IndexedAccessType, NodeId, CallArgument, BinaryOperator, BinaryOpType, FunctionDefinition, ArrowFunctionDefinition, IndexedAccessChainElement, NodeFlags, VariableDeclaration, Identifier, Flow, ScopeDisplay, StaticallyKnownScopeName, isStaticallyKnownScopeName, For, ForSubType, UnaryOperator, Do, While, Ternary, StructLiteral, StructLiteralInitializerMemberSubtype, StructLiteralInitializerMember, ArrayLiteral, ArrayLiteralInitializerMember, Catch, Try, Finally, New, Switch, CfTag, SwitchCase, SwitchCaseType, Conditional, ConditionalSubtype, SymTabEntry, mergeRanges } from "./node";
import { Scanner, CfFileType, SourceRange } from "./scanner";
import { hashType, cfFunctionSignature, cfIntersection, Type, TypeKind, cfCachedTypeConstructorInvocation, cfTypeConstructor, cfNever, cfStruct, cfUnion, SyntheticType, TypeFlags, cfArray, cfFunctionSignatureParam, extractCfFunctionSignature } from "./types";
import { filterNodeList, findAncestor, getAttributeValue, getContainingFunction, getSourceFile, getTriviallyComputableString, isHoistableFunctionDefinition, stringifyLValue } from "./utils";

export function Checker() {
    let sourceFile!: SourceFile;
    let scanner!: Scanner;
    let diagnostics!: Diagnostic[];
    let rootScope: ScopeDisplay;
    let noUndefinedVars = false;

    function check(sourceFile_: SourceFile) {
        sourceFile = sourceFile_;
        scanner = sourceFile.scanner;
        diagnostics = sourceFile.diagnostics;

        rootScope = sourceFile.containedScope!;
        rootScope; // "unused"

        checkListFunctionsLast(sourceFile.content);
    }

    function setNoUndefinedVars(newVal: boolean) : void {
        noUndefinedVars = newVal;
    }

    function typeErrorAtRange(range: SourceRange, msg: string) : void {
        const freshDiagnostic : Diagnostic = {
            fromInclusive: range.fromInclusive,
            toExclusive: range.toExclusive,
            msg: msg,
        }

        const debugFrom = scanner.getAnnotatedChar(freshDiagnostic.fromInclusive);
        const debugTo = scanner.getAnnotatedChar(freshDiagnostic.toExclusive);
        // bump 0-offsetted info to editor-centric 1-offset
        freshDiagnostic.__debug_from_line = debugFrom.line+1;
        freshDiagnostic.__debug_from_col = debugFrom.col+1;
        freshDiagnostic.__debug_to_line = debugTo.line+1;
        freshDiagnostic.__debug_to_col = debugTo.col+1;

        diagnostics.push(freshDiagnostic);
    }

    function typeErrorAtNode(node: Node, msg: string) {
        typeErrorAtRange(node.range, msg);
    }

    function checkList(nodes: Node[]) {
        for (const node of nodes) {
            checkNode(node);
        }
    }

    function forEach(nodes: Node[], cb: (node: Node) => void) {
        for (let i = 0; i < nodes.length; i++) {
            cb(nodes[i]);
        }
    }

    function checkListFunctionsLast(nodes: Node[]) {
        forEach(nodes.filter(node => node.kind !== NodeType.functionDefinition), checkNode);
        forEach(nodes.filter(node => node.kind === NodeType.functionDefinition), checkNode);
    }

    function checkNode(node: Node | null) {
        if (!node) return;

        switch (node.kind) {
            case NodeType.sourceFile:
                throw "Check source files by binding its content";
            case NodeType.comment:
                return;
            case NodeType.type:
                return;
            case NodeType.textSpan:
                return;
            case NodeType.terminal:
                return;
            case NodeType.hashWrappedExpr: // fallthrough
            case NodeType.parenthetical:   // fallthrough
            case NodeType.tagAttribute:
                checkNode(node.expr);
                return;
            case NodeType.tag:
                return;
            case NodeType.callExpression:
                checkCallExpression(node);
                return;
            case NodeType.callArgument:
                checkCallArgument(node);
                return;
            case NodeType.unaryOperator:
                checkUnaryOperator(node);
                return;
            case NodeType.binaryOperator:
                checkBinaryOperator(node);
                return;
            case NodeType.conditional:
                checkConditional(node);
                return;
            case NodeType.variableDeclaration:
                checkVariableDeclaration(node);
                return;
            case NodeType.statement:
                switch (node.subType) {
                    case StatementType.expressionWrapper: {
                        checkNode(node.expr);
                    }
                }
                return;
            case NodeType.returnStatement:
                checkNode(node.expr);
                return;
            case NodeType.breakStatement:
                return;
            case NodeType.continueStatement:
                return;
            case NodeType.block:
                switch (node.subType) {
                    case BlockType.fromTag:
                        // check attrs and etc...
                        checkListFunctionsLast(node.stmtList);
                        return;
                    case BlockType.cLike:
                        checkListFunctionsLast(node.stmtList);
                        return;
                    case BlockType.scriptSugaredTagCallBlock:
                        checkList(node.stmtList);
                        return;
                    case BlockType.scriptTagCallBlock:
                        checkList(node.stmtList);
                        return;
                }
                return;
            case NodeType.simpleStringLiteral:
                setCachedEvaluatedNodeType(node, SyntheticType.string());
                return;
            case NodeType.interpolatedStringLiteral:
                checkList(node.elements);
                setCachedEvaluatedNodeType(node, SyntheticType.string());
                return;
            case NodeType.numericLiteral:
                setCachedEvaluatedNodeType(node, SyntheticType.number());
                return;
            case NodeType.booleanLiteral:
                setCachedEvaluatedNodeType(node, SyntheticType.boolean());
                return;
            case NodeType.identifier:
                // klude/fixme!: identifier.source can be an indexed access
                // this was to support `a.b.c = 42`
                // what we need to do is parse that as a "dotted path";
                // if it turns out that the expression is an assignment, keep it that way
                // otherwise, transform it into an indexed-access expression
                // and if during "dotted-path" parsing, if we see that it became
                // a.b.c[1], or similar, transform it into an indexed-access
                checkIdentifier(node);
                return;
            case NodeType.indexedAccess:
                checkIndexedAccess(node);
                return;
            case NodeType.indexedAccessChainElement:
                checkIndexedAccessChainElement(node);
                return;
            case NodeType.sliceExpression:
                if (node.from) checkNode(node.from);
                if (node.to) checkNode(node.to);
                if (node.stride) checkNode(node.stride);
                return;
            case NodeType.functionParameter:
                if (!node.fromTag && node.defaultValue) checkNode(node.defaultValue);
                return;
            case NodeType.functionDefinition: // fallthrough
            case NodeType.arrowFunctionDefinition:
                checkFunctionDefinition(node);
                return;
            case NodeType.dottedPath:
                return;
            case NodeType.dottedPathRest:
                // no-op, taken care of by dottedPath
                return;
            case NodeType.switch:
                checkSwitch(node);
                return;
            case NodeType.switchCase:
                checkSwitchCase(node);
                return;
            case NodeType.do:
                checkDo(node);
                return;
            case NodeType.while:
                checkWhile(node);
                return;
            case NodeType.ternary:
                checkTernary(node);
                return;
            case NodeType.for:
                checkFor(node);
                return;
            case NodeType.structLiteral:
                checkStructLiteral(node);
                return;
            case NodeType.structLiteralInitializerMember:
                checkStructLiteralInitializerMember(node);
                return;
            case NodeType.arrayLiteral:
                checkArrayLiteral(node);
                return;
            case NodeType.arrayLiteralInitializerMember:
                checkArrayLiteralInitializerMember(node);
                return;
            case NodeType.try:
                checkTry(node);
                return;
            case NodeType.catch:
                checkCatch(node);
                return;
            case NodeType.finally:
                checkFinally(node);
                return;
            case NodeType.importStatement:
                return;
            case NodeType.new:
                checkNew(node);
                return;
            case NodeType.type:
                return;
            default:
                ((_:never) => { throw "Non-exhaustive case or unintentional fallthrough." })(node);
        }
    }
/*
    function getNearestScopeByName(node: Node, scopeName: StaticallyKnownScopeName) : cfStruct | undefined {
        while (true) {
            // scope on this node contains the target scope
            if (node.containedScope?.[scopeName]) {
                return node.containedScope[scopeName];
            }
            // didn't find it, but there is a container; we can jump to the parent container
            else if (node.containedScope?.container) {
                node = node.containedScope.container;
            }
            // didn't find it, and there is no container; climb to parent
            else if (node.parent) {
                node = node.parent;
            }
            // at the root, didn't find it
            else {
                return undefined;
            }
        }
    }*/

    //https://helpx.adobe.com/coldfusion/developing-applications/the-cfml-programming-language/using-coldfusion-variables/about-scopes.html
    const scopeLookupOrder : readonly StaticallyKnownScopeName[] = [
        "local",
        "arguments",
        "query", // magic inaccessible scope inside a <cfloop query=#q#>...</cfquery> body
        "thread",
        "variables",
        "cgi",
        "file",
        "url",
        "form",
        "cookie",
        "client"
    ];

    interface SymTabResolution {
        scopeName: StaticallyKnownScopeName,
        symTabEntry: SymTabEntry
    }

    interface SymbolResolution extends SymTabResolution {
        container: Node | null
    }

    function getScopeDisplayMember(scope: ScopeDisplay, canonicalName: string) : SymTabResolution | undefined {
        // could we not do this, if we stored a link to the symTab for nested things ?
        // how would that work for arrays? there wouldn't be a symTab for those...
        const path = canonicalName.split(".");
        if (path.length > 1) {
            if (!isStaticallyKnownScopeName(path[0])) return undefined;
            const scopeName = path[0];
            if (!scope.hasOwnProperty(scopeName) || !scope[scopeName as StaticallyKnownScopeName]!.get(path[1])) return undefined;
            let current = scope[scopeName as StaticallyKnownScopeName]!.get(path[1])!;
            for (let i = 2; i < path.length; i++) {
                if (current.type.typeKind !== TypeKind.struct) return undefined;
                let maybeNext = current.type.membersMap.get(path[i]);
                if (!maybeNext) return undefined;
                current = maybeNext;
            }
            return {scopeName: path[0], symTabEntry: current};
        }

        for (const scopeName of scopeLookupOrder) {
            if (scope.hasOwnProperty(scopeName)) {
                const entry = scope[scopeName]!.get(canonicalName);
                if (entry) {
                    return {scopeName: scopeName, symTabEntry: entry};
                }
            }
        }
        return undefined;
    }

    function walkupScopesToResolveSymbol(base: Node, canonicalName: string) : SymbolResolution | undefined {
        let node : Node | null = base;
        while (node) {
            if (node.containedScope) {
                const varEntry = getScopeDisplayMember(node.containedScope, canonicalName);
                if (varEntry) {
                    (varEntry as SymbolResolution).container = node;
                    return varEntry as SymbolResolution;
                }

                if (node.kind === NodeType.sourceFile) {
                    const type = checkLibRefsForName(canonicalName);
                    return type ? {scopeName: "global", symTabEntry: type, container: null} : undefined;
                }

                else {
                    node = node.containedScope.container;
                }
            }
            else {
                node = node.parent;
            }
        }

        return undefined;
    }

    function determineFlowType(base: Node, canonicalName: string) : Type | undefined {
        let node: Node | null = base;
        let flow: Flow | null = null;
        while (node) {
            if (node.flow) {
                flow = node.flow;
                break;
            }
            else {
                node = node.parent;
            }
        }

        if (!flow) { // we'll be defensive, but we should always get a Flow (a "root flow") from SourceFile
            return undefined;
        }

        const usageContainer : Node = findAncestor(base, (node) => node?.kind === NodeType.functionDefinition || node?.kind === NodeType.sourceFile)!;
        const usageContainerSymbol = getScopeDisplayMember(usageContainer.containedScope!, canonicalName);
        // if the usage container does not contain a symbol table entry for this name, then it is an "outer" variable, defined in some outer scope
        // walk up until we find it, and use it's non-flow based type
        if (!usageContainerSymbol) {
            let node : Node | null = usageContainer.containedScope!.container; 
            while (node) {
                const symbol = getScopeDisplayMember(node.containedScope!, canonicalName);
                if (symbol) return symbol.symTabEntry.type;
                node = node.containedScope!.container;
            }
            return undefined;
        }

        return work(flow);

        function work(flow: Flow) : Type | undefined {
            const type = getCachedEvaluatedFlowType(flow, canonicalName);

            // we got a type at this flow
            if (type) {
                return type;
            }
            else if (flow.node?.containedScope) {
                const scopeMember = getScopeDisplayMember(flow.node.containedScope, canonicalName);
                if (scopeMember) {
                    // no type at this flow, but the name is defined on this scope;
                    // stop walking upwards, because the current flow's node is the top-most container for this name,
                    // even if there is a predecessor flow

                    if (scopeMember.symTabEntry.type.typeKind === TypeKind.functionSignature) { // a function definition is always defined
                        return scopeMember.symTabEntry.type;
                    }

                    if (flow.node === usageContainer) {
                        return undefined; // it's defined on the closest containing scope, but hasn't been definitely assigned yet
                    }
                    else {
                        return scopeMember.symTabEntry.type; // it's defined in an outer scope
                    }
                }
                if (flow.node.kind === NodeType.functionDefinition) {
                    // we hit a containing function, and have not yet figured out the type
                    // check the rest of the grand-parent's body 
                    // but before we defer, check all parent containers to see if they even contain this name
                    if (walkupScopesToResolveSymbol(flow.node, canonicalName)) {
                        return undefined;
                    }
                }
            }

            // if we got to root and didn't find it, see if we can find it in stdlib (if stdlib was available)
            if (flow.node?.kind === NodeType.sourceFile) {
                return checkLibRefsForName(canonicalName)?.type;
            }

            if (flow.predecessor.length === 1) {
                return work(flow.predecessor[0]);
            }
            else {
                let containsUndefined = false;
                const flowTypes : Type[] = [];
                for (let i = 0; i < flow.predecessor.length; i++) {
                    const type = work(flow.predecessor[i]);
                    if (type) flowTypes.push(type);
                    else containsUndefined = true;
                }
                return flowTypes.length === 0 ? undefined : unionify(flowTypes, containsUndefined);
            }
        }
    }

    // needs to merge 2+ unions, dedup, etc.
    // union type needs to be a Set<Type>
    // "instantiated type": {flags: TypeFlag, type: Type} so we can share "any" and "void" and etc.
    function unionify(types: Type[], definitelyContainsUndefined = false) : Type {
        let flags : TypeFlags = TypeFlags.none;
        const members : Type[] = [];
        const seen = new Set<string>();
        for (const type of types) {
            if (type.typeFlags & TypeFlags.containsUndefined) {
                flags |= TypeFlags.containsUndefined;
            }
            else if (type.typeKind === TypeKind.any || type.typeKind === TypeKind.never) {
                return type;
            }
            else {
                const hash = hashType(type);
                if (!seen.has(hash)) {
                    members.push(type);
                    seen.add(hash);
                }
            }
        }

        let result = members.length === 1 ? members[0] : cfUnion(...members);
        result.typeFlags = flags;
        if (definitelyContainsUndefined) result.typeFlags |= TypeFlags.containsUndefined;
        return result;
    }

    function checkLibRefsForName(canonicalName: string) : SymTabEntry | undefined{
        for (const lib of sourceFile.libRefs) {
            if (lib.containedScope?.global?.has(canonicalName)) return lib.containedScope.global.get(canonicalName)!;
        }
        return undefined;
    }

    function isCallable(type: Type) : boolean {
        return type.typeKind === TypeKind.any
            || type.typeKind === TypeKind.functionSignature
            || (type.typeKind === TypeKind.intersection && (isCallable(type.left) || isCallable(type.right)))
            || (type.typeKind === TypeKind.union && type.members.every(type => isCallable(type)));
    }

    function unsafeAssertTypeKind<T extends Type>(_type: Type) : asserts _type is T {}

    /**
     * is the following legal:
     * <to> = <assignThis>
     * this needs alot of work
     * @param assignThis 
     * @param to 
     */
    function isAssignable(assignThis: Type, to: Type) : boolean {
        if (assignThis.typeKind === TypeKind.any || to.typeKind === TypeKind.any) {
            return true;
        }
        if (assignThis.typeKind !== to.typeKind) { // structs to structs, arrays to arrays, etc
            return false;
        }
        if (assignThis.typeKind === TypeKind.struct && to.typeKind === TypeKind.struct) {
            if (assignThis.membersMap.size < to.membersMap.size) {
                return false;
            }

            for (const key of to.membersMap.keys()) {
                if (!assignThis.membersMap.has(key)) {
                    return false;
                }
                if (!isAssignable(assignThis.membersMap.get(key)!.type, to.membersMap.get(key)!.type)) {
                    return false;
                }
            }

            return true;
        }

        // ah no cool handling of function assignability or etc.
        return true;
    }

    function pushTypesIntoInlineFunctionDefinition(context: Node, signature: cfFunctionSignature, functionDef: (FunctionDefinition | ArrowFunctionDefinition)) {
        const existingArgumentsScope = functionDef.containedScope!.arguments!;
        for (let i = 0; i < signature.params.length; i++) {
            if (i === functionDef.params.length) {
                break;
            }
            if (existingArgumentsScope.has(signature.params[i].canonicalName)) {
                existingArgumentsScope.get(signature.params[i].canonicalName)!.inferredType = evaluateType(context, signature.params[i].type);
            }
        }
    }

    function checkCallExpression(node: CallExpression) {
        checkNode(node.left);
        checkList(node.args);
        const type = getCachedEvaluatedNodeType(node.left);
        if (type) {
            if (type.typeKind === TypeKind.any) {
                setCachedEvaluatedNodeType(node, SyntheticType.any());
                return;
            }
            if (isCallable(type) && type.typeKind === TypeKind.functionSignature) {
                setCachedEvaluatedNodeType(node, type.returns);

                const minRequiredParams = type.params.filter(param => param.flags & TypeFlags.required).length;
                const maxParams = type.params.length;
                const namedArgCount = node.args.filter(arg => !!arg.equals).length;

                if (namedArgCount !== node.args.length && namedArgCount !== 0) {
                    typeErrorAtRange(mergeRanges(node.leftParen, node.args, node.rightParen), "All arguments must be named, if any are named.");
                }

                if (node.args.length < minRequiredParams || node.args.length > maxParams) {
                    let msg;
                    if (minRequiredParams !== maxParams) msg = `Expected between ${minRequiredParams} and ${maxParams} arguments, but got ${node.args.length}`;
                    else msg = `Expected ${maxParams} arguments, but got ${node.args.length}`;
                    typeErrorAtRange(mergeRanges(node.leftParen, node.args, node.rightParen), msg);
                }

                if (namedArgCount === node.args.length) {
                    // reorder args to match params ?
                }

                for (let i = 0; i < node.args.length; i++) {
                    const paramType = type.params[i]?.type ?? null;
                    if (!paramType) break;
                    const arg = node.args[i];
                    const argType = getCachedEvaluatedNodeType(arg);
                    if (!isAssignable(/*assignThis*/ argType, /*to*/ paramType)) {
                        // error
                    }
                    if (paramType.typeKind === TypeKind.functionSignature && (arg.expr.kind === NodeType.functionDefinition || arg.expr.kind === NodeType.arrowFunctionDefinition)) {
                        pushTypesIntoInlineFunctionDefinition(node, paramType, arg.expr);
                        checkNode(arg.expr.body as Node /*fixme: we know this is a script function definition but can't prove it here; anyway, all function defs should have Node as a body, not Node|Node[] ?*/);
                    }
                }
            }
            else {
                // error
            }
        }
    }

    function checkCallArgument(node: CallArgument) {
        // should probably do this all in one go inside checkArgList or something
        checkNode(node.expr);
    }

    function checkUnaryOperator(node: UnaryOperator) {
        checkNode(node.expr);
        const type = getCachedEvaluatedNodeType(node.expr);
        if (type.typeKind !== TypeKind.any && type.typeKind !== TypeKind.number) {
            typeErrorAtNode(node.expr, "Unary operator requires a numeric operand.");
        }
    }

    

    function checkBinaryOperator(node: BinaryOperator) {
        checkNode(node.left);
        checkNode(node.right);

        switch (node.optype) {
            case BinaryOpType.assign: {
                // an assignment, even fv-unqualified, will always be bound to a scope
                // `x = y` is effectively `variables.x = y`
                if (node.left.kind === NodeType.identifier || node.left.kind === NodeType.indexedAccess) {
                    const lValIdent = stringifyLValue(node.left);
                    if (!lValIdent) return;

                    const lhsType = determineFlowType(node.left, lValIdent.canonical);
                    const rhsType = getCachedEvaluatedNodeType(node.right);
                    if (!lhsType) {
                        // there is no type in the current flow; so, this is the first assignment for this var in this scope
                        if (node.typeAnnotation) {
                            const evaluatedTypeAnnotation = evaluateType(node, node.typeAnnotation);
                            if (!isAssignable(rhsType, node.typeAnnotation)) {
                                //typeErrorAtNode(node.right, "RHS is not assignable to LHS.");
                            }
                            setCachedEvaluatedFlowType(node.left.flow!, lValIdent.canonical, evaluatedTypeAnnotation);
                        }
                        else {
                            setCachedEvaluatedFlowType(node.left.flow!, lValIdent.canonical, rhsType);
                        }
                    }
                    else {
                        if (node.typeAnnotation) {
                            typeErrorAtNode(node, "Type annotations can only be bound to an identifier's first assignment.");
                        }
                        if (isAssignable(/*assignThis*/rhsType, /*to*/lhsType)) {
                            setCachedEvaluatedFlowType(node.left.flow!, lValIdent.canonical, rhsType);
                        }
                        else {
                            //typeErrorAtNode(node.right, "RHS is not assignable to LHS.");
                        }
                    }
                }

                break;
            }
            case BinaryOpType.assign_cat:
            case BinaryOpType.contains:
            case BinaryOpType.does_not_contain:
            case BinaryOpType.cat: {
                const leftType = getCachedEvaluatedNodeType(node.left);
                const rightType = getCachedEvaluatedNodeType(node.right);
                if (leftType.typeKind !== TypeKind.any && leftType.typeKind !== TypeKind.string) {
                    //typeErrorAtNode(node.left, `Left operand to '${BinaryOpTypeUiString[node.optype]}' operator must be a string.`);
                }
                if (rightType.typeKind !== TypeKind.any && rightType.typeKind !== TypeKind.string) {
                    //typeErrorAtNode(node.right, `Right operand to '${BinaryOpTypeUiString[node.optype]}' operator must be a string.`);
                }
                break;
            }
            case BinaryOpType.eq:
            case BinaryOpType.neq:
            case BinaryOpType.equivalent:
            case BinaryOpType.implies: {
                break;
            }
            default: { // all other operators are (number op number)
                const leftType = getCachedEvaluatedNodeType(node.left);
                const rightType = getCachedEvaluatedNodeType(node.right);
                // acf allows (bool) + (bool), but maybe we don't want to support that
                if (leftType.typeKind !== TypeKind.any && leftType.typeKind !== TypeKind.number) {
                    //typeErrorAtNode(node.left, `Left operand to '${BinaryOpTypeUiString[node.optype]}' operator must be a number.`);
                }
                if (rightType.typeKind !== TypeKind.any && rightType.typeKind !== TypeKind.number) {
                    //typeErrorAtNode(node.right, `Right operand to '${BinaryOpTypeUiString[node.optype]}' operator must be a number.`);
                }
            }
        }
    }

    function checkConditional(node: Conditional) {
        if (node.subType === ConditionalSubtype.if || node.subType === ConditionalSubtype.elseif) {
            if (node.fromTag) checkNode((node.tagOrigin.startTag as CfTag.ScriptLike).expr);
            else checkNode(node.expr);
            checkNode(node.consequent);
            checkNode(node.alternative);
        }
        else {
            checkNode(node.consequent);
        }
    }

    function setCachedEvaluatedFlowType(flow: Flow, name: string, type: Type) : void {
        if (!sourceFile.cachedFlowTypes.has(flow.flowId)) {
            sourceFile.cachedFlowTypes.set(flow.flowId, new Map());
        }
        sourceFile.cachedFlowTypes.get(flow.flowId)!.set(name, type);
    }

    function getCachedEvaluatedFlowType(flow: Flow, name: string) : Type | undefined {
        return sourceFile.cachedFlowTypes.get(flow.flowId)?.get(name);
    }

    // `var x` without an initializer is valid in `for (var x in y)`;
    // otherwise it should always be `var x = ...`
    // both are variable declarations
    // we would like to extract `x` out of the above in both cases
    // note that `for (var x.y in z)` is valid code, and there was recently a complaint on the ACF bug tracker that `for (var x['y'] in z)` should also be valid
    // these would effectively declare `var x = {y: ?}` 
    function getVariableDeclarationLValue(node: VariableDeclaration) : Identifier | IndexedAccess | undefined {
        let workingNode : Node = node.expr;
        if (workingNode.kind === NodeType.binaryOperator) workingNode = workingNode.left;
        if (workingNode.kind === NodeType.identifier || workingNode.kind === NodeType.indexedAccess) return workingNode;
        else return undefined;
    }

    function checkVariableDeclaration(node: VariableDeclaration) : void {
        const lValue = getVariableDeclarationLValue(node);
        if (!lValue) return;
        const name = stringifyLValue(lValue);
        if (!name) return;
        const canonicalPath = name.canonical.split(".");
        if (canonicalPath.length > 2) return;

        const isForInit = node.parent?.kind === NodeType.for &&
            ((node.parent.subType === ForSubType.forIn && node === node.parent.init) ||
             (node.parent.subType === ForSubType.for && node === node.parent.initExpr));

        if (isForInit && node.finalModifier) {
            typeErrorAtRange(mergeRanges(node.finalModifier, node.expr), `final-qualified declaration in a for initializer will fail at runtime.`);
        }

        let rhsType : Type | undefined = undefined;

        if (node.expr.kind === NodeType.binaryOperator) {
            checkNode(node.expr.right);
            rhsType = getCachedEvaluatedNodeType(node.expr.right);
        }
        else if (isForInit && node.parent?.kind === NodeType.for && node.parent.subType === ForSubType.forIn && node === node.parent.init) {
            rhsType = getCachedEvaluatedNodeType(node.parent.expr);
        }
        else {
            return; // should be unreachable; a variable delcaration is either initialized (var x = y) or a for-in expr (for x in y)
        }

        // check for rebinding of final vars
        let hasOtherFinalDecl = false;

        const symbol = walkupScopesToResolveSymbol(node, name.canonical)?.symTabEntry;
        if (symbol && symbol.declarations) {
            hasOtherFinalDecl = filterNodeList(symbol.declarations, (decl) => decl.kind === NodeType.variableDeclaration && !!decl.finalModifier && decl !== node).length > 0;
        }

        if (hasOtherFinalDecl) {
            typeErrorAtNode(lValue, `Cannot rebind identifier '${name.ui}', which was declared final.`);
            return;
        }

        if (node.finalModifier) rhsType.typeFlags |= TypeFlags.final;
        
        if (symbol) {
            symbol.type = rhsType;
        }

        setCachedEvaluatedFlowType(lValue.flow!, name.canonical, rhsType);
    }

    // fixme: needs to take a SourceFile arg or that defaults to our current or ...
    function getCachedEvaluatedNodeTypeImpl(node: Node | null, workingSourceFile: SourceFile) : Type {
        if (!node) {
            return SyntheticType.any();
        }

        let targetId = node.nodeId;

        /*if (node.kind === NodeType.indexedAccess) {
            targetId = node.accessElements[node.accessElements.length-1].nodeId;
        }*/

        if (workingSourceFile.cachedNodeTypes.has(targetId)) {
            return workingSourceFile.cachedNodeTypes.get(targetId)!;
        }
        else {
            return SyntheticType.any();
        }
    }

    function getCachedEvaluatedNodeType(node: Node | null) {
        return getCachedEvaluatedNodeTypeImpl(node, sourceFile);
    }

    function setCachedEvaluatedNodeType(node: Node, type: Type) {
        if (type.typeKind === TypeKind.typeConstructor
            || type.typeKind === TypeKind.typeConstructorInvocation
            || type.typeKind === TypeKind.cachedTypeConstructorInvocation) {
            typeErrorAtNode(node, "Type is not concrete.");
            sourceFile.cachedNodeTypes.set(node.nodeId, SyntheticType.any());
        }
        else {
            sourceFile.cachedNodeTypes.set(node.nodeId, type);
        }
    }

    function isStructOrArray(type: Type) : boolean {
        return type.typeKind === TypeKind.struct
            || type.typeKind === TypeKind.array
            || (type.typeKind === TypeKind.intersection && (isStructOrArray(type.left) || isStructOrArray(type.right)))
            || (type.typeKind === TypeKind.union && type.members.every(type => isStructOrArray(type)));
    }

    function getContainer(node: Node) {
        return findAncestor(node, (node) => !!node?.containedScope);
    }

    // kludgy shim to take a ScopeDisplay member and wrap it in a cfStruct, so we can bridge the gap between those worlds, mostly for the 
    // sake of completions; a "scope" in CF is essentially a struct, but not quite; and vice versa; so the abstraction is not perfect but it's close
    function structViewOfScope(scopeContents: Map<string, SymTabEntry>) : cfStruct {
        return SyntheticType.struct(scopeContents);
    }

    function checkIdentifier(node: Identifier) {
        // if we're on the lefthand side of a non-fv qualified assignment, we're done
        // an fv-qualified assignment is handled by checkVariableDeclaration
        // assignment should alter the type of the variable for this flow in checkBinaryOperator
        if (node.parent?.kind === NodeType.binaryOperator && node.parent.optype === BinaryOpType.assign && node === node.parent.left) {
            return;
        }

        const name = node.canonicalName;

        if (name !== undefined) {
            const useContainer = getContainer(node);

            if (isStaticallyKnownScopeName(name)) {
                if (name === "local" || name === "arguments") {
                    const containingFunction = getContainingFunction(node);
                    if (!containingFunction) {
                        // warn about local/arguments use outside of function
                        return;
                    }
                    setCachedEvaluatedNodeType(node, structViewOfScope(containingFunction.containedScope![name]!));
                }
                else if (name === "this") {
                    const sourceFile = getSourceFile(node)!;
                    if (sourceFile.cfFileType !== CfFileType.cfc) {
                        // warn about using `this` outside of a cfc
                        return;
                    }
                    setCachedEvaluatedNodeType(node, structViewOfScope(sourceFile.containedScope!.this!)); // need a "cached copy" of this
                }
                else {
                    // @fixme
                    //setCachedTermEvaluatedType(node, rootScope[name] ?? SyntheticType.any);
                }
                return;
            }

            const resolvedSymbol = walkupScopesToResolveSymbol(node, name);
            let flowType = determineFlowType(node, name);

            // we know the symbol, but it has no flow type yet
            // it's possible we don't know the symbol (inherited from parent cfc or cfinclude'd), in which case we don't want to report this
            if (resolvedSymbol) {
                if (flowType && flowType.typeFlags & TypeFlags.containsUndefined) {
                    typeErrorAtNode(node, `'${name}' is possibly undefined.`);
                }
                else if (flowType === undefined) {
                    typeErrorAtNode(node, `'${name}' is used before its first definition.`)
                }
            }
            
            // if we got a flow type, use that
            if (flowType) {
                const evaluatedType = evaluateType(node, flowType);
                // is it necessary to cache the type on both the flow node (if it exists) *and* the node?
                if (node.flow) setCachedEvaluatedFlowType(node.flow, name, evaluatedType);
                setCachedEvaluatedNodeType(node, evaluatedType);
                return;
            }

            // otherwise, fallback to the symbol type
            if (resolvedSymbol) {
                if (useContainer === resolvedSymbol.container) {
                    // there is a symbol table entry, but we could not find a type on the flow graph
                    // if we're toplevel 
                    /*if (noUndefinedVars) {
                        typeErrorAtNode(node, `Identifier '${name}' is used before its declaration.`);
                    }*/
                    setCachedEvaluatedNodeType(node, SyntheticType.any());
                    return;
                }
                else {
                    // identifer is declared in some outer scope, we have to assume it is ok
                    setCachedEvaluatedNodeType(node, resolvedSymbol.symTabEntry.type);
                    return;
                }
            }

            if (noUndefinedVars) {
                typeErrorAtNode(node, `Cannot find name '${name}'.`);
            }
        }
    }

    function checkIndexedAccess(node: IndexedAccess) {
        checkNode(node.root);

        let type : Type | undefined = getCachedEvaluatedNodeType(node.root);
        if (!type || type.typeKind === TypeKind.any) {
            return;
        }

        // we set cached types on 'root' elements,
        // that is, the indexed-access root node itself, and the subsequent elements
        // not on the component identifiers, dots, brackets, etc.
        if (isStructOrArray(type)) {
            for (let i = 0; i < node.accessElements.length; i++) {
                const element = node.accessElements[i];
                if (element.accessType === IndexedAccessType.dot) {
                    type = getMemberType(type, node, element.property.token.text.toLowerCase());
                    if (!type) {
                        type = SyntheticType.any();
                        
                        if (noUndefinedVars) {
                            typeErrorAtNode(element.property, `Property '${element.property.token.text}' does not exist on type`);
                        }
                    }
                    if (type.typeKind === TypeKind.any) {
                        type = SyntheticType.any(); // subsequent access elements will also be any
                        setCachedEvaluatedNodeType(element, SyntheticType.any());
                    }
                    else {
                        setCachedEvaluatedNodeType(element, type);
                    }
                }
            }
            setCachedEvaluatedNodeType(node, type); // in `a.b.c`, the whole indexedAccess expression type is typeof c
        }
        else {
            setCachedEvaluatedNodeType(node.root, SyntheticType.any());
            for (const element of node.accessElements) {
                setCachedEvaluatedNodeType(element, SyntheticType.any());
            }
            // error: some kind of indexed access error
        }

        checkList(node.accessElements);
    }

    function checkIndexedAccessChainElement(node: IndexedAccessChainElement) {
        if (node.parent!.flags & NodeFlags.checkerError) {
            setCachedEvaluatedFlowType
            return;
        }

        const parentType = getCachedEvaluatedNodeType(node.parent);
        if (parentType.typeKind === TypeKind.any) {
            return;
        }

        if (node.accessType === IndexedAccessType.dot) {
            const name = node.property.token.text;
            if (!(<cfStruct>parentType).membersMap.has(name)) {
                if (noUndefinedVars) {
                    //typeErrorAtNode(node.property, `Property '${name}' does not exist on parent type.`);
                }
                node.flags |= NodeFlags.checkerError;
            }
        }
    }

    function checkFunctionDefinition(node: FunctionDefinition | ArrowFunctionDefinition) {
        // we need the extracted cf type, and then, if there is a type annotation, make sure the types are assignable (in either direction?)
        // the extracted cf type is in the symbol table for the scope "into which" it was hoisted; could be variables, local, or this
        // we should maybe just extract the cf type here..., as long as we check hoistable functions first....
        // const extracedType...
        // if no type annotation
        //      set type to extracted type, which in the limit will be (...any: []) => any
        // else if node.typeAnnotation...
        // if (!isAssignable(extractedType, typeAnnotation) || (!isAssignable(typeAnnotation, extractedType)))
        //      error, set type to any
        // else
        //      set type to typeAnnotation, on the assumption it will be more specific (why'd the user type it otherwise)
        //

        if (!isHoistableFunctionDefinition(node)) {
            setCachedEvaluatedNodeType(node, extractCfFunctionSignature(node));
        }
        
        for (const param of node.params) {
            setCachedEvaluatedFlowType(node.flow!, param.canonicalName, param.type || SyntheticType.any());
        }

        if (node.kind === NodeType.functionDefinition && node.fromTag) {
            checkListFunctionsLast(node.body);
        }
        else {
            checkNode(node.body);
        }
    }

    function checkSwitch(node: Switch) {
        if (node.fromTag) {
            checkNode(getAttributeValue((node.tagOrigin.startTag as CfTag.Common).attrs, "expression") ?? null)
        }
        else {
            checkNode(node.expr);
        }
        for (const case_ of node.cases) {
            checkNode(case_);
        }
    }

    function checkSwitchCase(node: SwitchCase) {
        if (node.fromTag) {
            if (node.tagOrigin.startTag?.canonicalName === "cfcase") {
                const attr = getAttributeValue((node.tagOrigin.startTag as CfTag.Common).attrs, "value") ?? null;
                // pre-cf2021 it has to be a string or numeric literal
                checkNode(attr);
            }
            checkList(node.body);
            return;
        }

        if (node.caseType === SwitchCaseType.case) {
            // pre cf-2021 it has to be a string or numeric literal
            checkNode(node.expr);
        }
        checkList(node.body);
    }

    function checkDo(node: Do) {
        checkNode(node.body);
        checkNode(node.expr);
    }

    function checkWhile(node: While) {
        checkNode(node.expr);
        checkNode(node.body);
    }

    function checkTernary(node: Ternary) {
        checkNode(node.expr);
        checkNode(node.ifTrue);
        checkNode(node.ifFalse);
    }

    //
    // type lookup
    //
    function walkUpContainersToFindType(context: Node, type: Type) : Type | undefined {
        if (type.typeKind !== TypeKind.typeId) {
            return type;
        }

        let node : Node | null = context;
        const typeName = type.uiName;

        while (node) {
            if (node.containedScope) {
                if (node.containedScope.typedefs) {
                    if (node.containedScope.typedefs.has(typeName)) {
                        return node.containedScope.typedefs.get(typeName)!;
                    }
                }
                if (node.kind === NodeType.sourceFile) {
                    break;
                }
                else {
                    node = node.containedScope.container;
                }
            }
            else {
                node = node.parent;
            }
        }

        if (node) { // should always be true (we hit the top, SourceFile, and broke out of the above loop)
            // find the `std` type in the libfiles, which we're just assuming will be either present or not, and if so, it is the only libfile
            for (const libFile of node.libRefs) {
                for (const typedef of libFile.content) {
                    if (typedef.kind === NodeType.type && typedef.typeKind === TypeKind.struct && typedef.uiName === "std") {
                        return typedef.membersMap.get(type.uiName)?.type;
                    }
                }
            }
        }

        if (!type.synthetic) {
            typeErrorAtNode(type, `Cannot find name '${type.uiName}'.`);
        }
        return undefined;
    }

    function checkFor(node: For) {
        if (node.subType === ForSubType.forIn) {
            checkNode(node.expr);
            checkNode(node.init);
            checkNode(node.body);
            return;
        }
        checkNode(node.initExpr);
        checkNode(node.conditionExpr);
        checkNode(node.incrementExpr);
        checkNode(node.body);
    }

    function checkStructLiteral(node: StructLiteral) {
        // got `[:]`, there is nothing to check
        if (node.emptyOrderedStructColon) {
            return;
        }
        checkList(node.members);
        const memberTypes = new Map<string, SymTabEntry>();
        for (const member of node.members) {
            if (member.subType === StructLiteralInitializerMemberSubtype.keyed) {
                const key = getTriviallyComputableString(member.key);
                if (!key) continue;
                const canonicalName = key.toLowerCase();
                memberTypes.set(canonicalName, {
                    uiName: key,
                    canonicalName,
                    declarations: member,
                    inferredType: null,
                    userType: null,
                    type: getCachedEvaluatedNodeType(member)
                });
            }
        }
        setCachedEvaluatedNodeType(node, SyntheticType.struct(memberTypes));
    }

    function checkStructLiteralInitializerMember(node: StructLiteralInitializerMember) {
        if (node.subType === StructLiteralInitializerMemberSubtype.keyed) {
            checkNode(node.key);
            checkNode(node.expr);
            setCachedEvaluatedNodeType(node, getCachedEvaluatedNodeType(node.expr));
        }
        else /* spread */ {
            checkNode(node.expr);
        }
    }

    function checkArrayLiteral(node: ArrayLiteral) {
        checkList(node.members);
        setCachedEvaluatedNodeType(node, cfArray(unionify(node.members.map(member => getCachedEvaluatedNodeType(member)))));
    }

    function checkArrayLiteralInitializerMember(node: ArrayLiteralInitializerMember) {
        checkNode(node.expr);
        setCachedEvaluatedNodeType(node, getCachedEvaluatedNodeType(node.expr));
    }

    function checkTry(node: Try) {
        checkList(node.body);
        checkList(node.catchBlocks);
        checkNode(node.finallyBlock);
    }

    function checkCatch(node: Catch) {
        if (node.fromTag) {
            // find exception binding via attributes?
            checkList(node.body);
            return;
        }
        // put node.exceptionBinding into flow, maybe do that in binder
        checkList(node.body)
    }

    function checkFinally(node: Finally) {
        checkList(node.body);
    }

    function checkNew(node: New) {
        checkNode(node.callExpr);
    }

    function getMemberType(type: Type, context: Node, name: string) : Type | undefined {
        if (type.typeKind === TypeKind.intersection) {
            const left = getMemberType(type.left, context, name);
            const right = getMemberType(type.right, context, name);
            if (!left || !right) return cfNever();
            return cfIntersection(left, right);
        }
        else if (type.typeKind === TypeKind.struct) {
            const memberType = type.membersMap.get(name);
            return memberType ? evaluateType(context, memberType.type) : undefined;
        }

        return undefined;
    }

    function getTypeOfExpression(node: Node) : Type {
        if (!getCachedEvaluatedNodeType(node)) checkNode(node);
        return getCachedEvaluatedNodeType(node);
    }
    getTypeOfExpression;

    /*function getScope(origin: Node, name: StaticallyKnownScopeName) : SymTab | undefined {
        if (name === "local") {
            return getContainingFunction(origin)?.containedScope?.local;
        }
        else {
            return sourceFile.containedScope[name];
        }
    }*/

    //
    // type evaluation
    //
    const evaluateType = (function() {
        type NodeTrie = Map<NodeId, NodeTrie> & Map<null, Type | "PENDING"> ;
        const typeConstructorInvocationCacheTrie : NodeTrie = new Map();
        
        const enum TypeCache_Status { resolved, resolving, noCache };
        type TypeCache_Resolution = TypeCache_Cached | TypeCache_NoCache;
        interface TypeCache_Cached {
            status: TypeCache_Status.resolved,
            value: Type
        }
        interface TypeCache_NoCache {
            status: TypeCache_Status.resolving | TypeCache_Status.noCache
        }
        
        function setCachedTypeConstructorInvocation(typeFunction: cfTypeConstructor, args: Type[], val: "PENDING" | Type) : void {
            function getChildTrieMapOrNull(thisLevel: NodeTrie, nodeId: NodeId) : NodeTrie | null {
                const result = thisLevel.get(nodeId);
                if (result && typeof result === "object") {
                    return result;
                }
                else {
                    return null;
                }
            }
        
            if (args.length === 0) {
                const bottom : NodeTrie = new Map();
                bottom.set(null, val);
                typeConstructorInvocationCacheTrie.set(typeFunction.nodeId, bottom);
                return;
            }
        
            let workingMap = getChildTrieMapOrNull(typeConstructorInvocationCacheTrie, typeFunction.nodeId);
        
            for (let i = 0; i < args.length; i++) { // is args ever 0 in a type call ?
                if (i === args.length - 1) {
                    if (workingMap === null) {
                        workingMap = new Map() as NodeTrie;
                        typeConstructorInvocationCacheTrie.set(typeFunction.nodeId, workingMap);
                    }
                    const existingNextLevel = getChildTrieMapOrNull(workingMap, args[i].nodeId);
                    if (existingNextLevel) {
                        existingNextLevel.set(null, val);
                    }
                    else {
                        const bottom = new Map([[null, val]]) as NodeTrie;
                        workingMap.set(args[i].nodeId, bottom)
                    }
                }
                else {
                    if (workingMap === null) {
                        workingMap = new Map() as NodeTrie;
                        typeConstructorInvocationCacheTrie.set(typeFunction.nodeId, workingMap);
                    }
        
                    const existingNextLevel = getChildTrieMapOrNull(workingMap, args[i].nodeId);
                    if (existingNextLevel) {
                        workingMap = existingNextLevel;
                    }
                    else {
                        const generatedNextLevel = new Map();
                        workingMap.set(args[i].nodeId, generatedNextLevel);
                        workingMap = generatedNextLevel;
                    }
                }
            }
        }

        function getCachedTypeConstructorInvocation(typeFunction: cfTypeConstructor, args: Type[]) : TypeCache_Resolution {
            let trieDescender = typeConstructorInvocationCacheTrie.get(typeFunction.nodeId);
            for (let i = 0; i < args.length; i++) {
                if (!trieDescender) {
                    return {status: TypeCache_Status.noCache};
                }
                trieDescender = trieDescender.get(args[i].nodeId);
            }
        
            if (!trieDescender) {
                return {status: TypeCache_Status.noCache}
            }
        
            const cachedResult = trieDescender.get(null);
        
            if (!cachedResult) {
                // this should never happen; log an error or something
                return {status: TypeCache_Status.noCache};
            }
            if (cachedResult === "PENDING") {
                return {status: TypeCache_Status.resolving};
            }
            else {
                return {status: TypeCache_Status.resolved, value: cachedResult}
            }
        }

        function evaluateType(context: Node, type: Type | null, typeParamMap: Map<string, Type> = new Map(), depth = 0) : Type {
            return typeWorker(type);

            // here args[n] should already have been evaluated
            function invokeTypeConstructor(typeFunction: cfTypeConstructor, args: Type[]) : Type {
                if (args.findIndex(type => type.typeKind === TypeKind.never) !== -1) {
                    return cfNever();
                }

                depth++;
                const result = (function() {
                    if (typeFunction.params.length !== args.length) {
                        // hit this once by writing @type U<T>
                        // when only @type T<U> was valid;
                        // need some type checking of the type system
                        throw "args.length !== typeFunction.params.length"
                    }
                
                    const cached = getCachedTypeConstructorInvocation(typeFunction, args);
                    if (cached.status === TypeCache_Status.resolved) {
                        return cached.value;
                    }
                
                    const typeParamMap = new Map(typeFunction.capturedParams.entries());
                    // extend constructor's captured environment with the argument list
                    for (let i = 0; i < typeFunction.params.length; i++) {
                        typeParamMap.set(typeFunction.params[i].uiName, args[i]);
                    }
                
                    // say our current evaluation is for `T<U>`
                    // set `T<U>` to "PENDING" so that we have something to check for to not recurse infinitely on something like `T<U> = {foo: T<U>}`
                    setCachedTypeConstructorInvocation(typeFunction, args, "PENDING");
                    const result = evaluateType(context, typeFunction.body, typeParamMap, depth+1);
                    setCachedTypeConstructorInvocation(typeFunction, args, result);
            
                    if (result.typeKind === TypeKind.typeConstructor) {
                        // if a type constructor returned a type constructor, extend the new type constructor's environment
                        // with the parent's environment + the args to the parent's invocation
                        // inner most names shadows outer names if there are name conflicts
                        result.capturedParams = typeParamMap;
                    }
                    return result;
                })();
                depth--;
                return result;
            }
            
            function evaluateIntersection(left: Type, right: Type) : Type {
                if (left.typeKind === TypeKind.never || right.typeKind === TypeKind.never) {
                    return cfNever();
                }

                depth++;
                const result = (function() {
                    if (left.typeKind === TypeKind.struct && right.typeKind === TypeKind.struct) {
                        let longest = left.membersMap.size > right.membersMap.size ? left.membersMap : right.membersMap;
                        let shortest = longest === left.membersMap ? right.membersMap : left.membersMap;
                
                        const remainingLongestKeys = new Set([...longest.keys()]);
                        const result = new Map<string, SymTabEntry>();
                        for (const key of shortest.keys()) {
                            remainingLongestKeys.delete(key);
                            const evaluatedShortest = typeWorker(shortest.get(key)!.type);
                            const evaluatedLongest = longest.has(key) ? typeWorker(longest.get(key)!.type) : null;
                            if (!evaluatedLongest) {
                                result.set(key, {uiName: shortest.get(key)!.uiName, canonicalName: key, declarations: null, userType: null, inferredType: null, type: evaluatedShortest});
                                continue;
                            }
                            const intersect = evaluateIntersection(evaluatedShortest, evaluatedLongest);
                            if (intersect.typeKind === TypeKind.never) {
                                return cfNever();
                            }
                            else {
                                result.set(key, {uiName: longest.get(key)!.uiName, canonicalName: key, declarations: null, userType: null, inferredType: null, type: evaluatedLongest});
                            }
                        }
                
                        for (const key of remainingLongestKeys) {
                            result.set(key, longest.get(key)!);
                        }
                
                        return SyntheticType.struct(result);
                    }
                    else {
                        // only valid type operands to the "&" type operator are {}
                        // which is not the "empty interface" but just a shorthand for "struct"
                        return cfNever();
                    }
                })();
                depth--;
                return result;
            }

            function typeWorker(type: Type | null) : Type {
                depth++;
                const result = (function() : Type {
                    if (!type) return SyntheticType.any();
                    
                    switch (type.typeKind) {
                        case TypeKind.intersection: {
                            const left = typeWorker(type.left);
                            const right = typeWorker(type.right,);
                            return evaluateIntersection(left, right);
                        }
                        case TypeKind.union: {
                            return cfUnion(...type.members.map(type => typeWorker(type))); // need to dedupe and etc.
                        }
                        case TypeKind.struct: { // work on cacheability of this; it is concrete just return a cached copy or something like that
                            const evaluatedStructContents = new Map<string, SymTabEntry>();
                            let concrete = true;
                            for (const key of type.membersMap.keys()) {
                                const preEvaluatedId = type.membersMap.get(key)!.type.nodeId;
                                const evaluatedType = typeWorker(type.membersMap.get(key)!.type);
                                const postEvaluatedId = evaluatedType.nodeId;
                                if (preEvaluatedId !== postEvaluatedId) {
                                    concrete = false;
                                }
                                evaluatedStructContents.set(key, {
                                    uiName: type.membersMap.get(key)!.uiName,
                                    declarations: null,
                                    canonicalName: key,
                                    userType: null,
                                    inferredType: null,
                                    type: evaluatedType
                                });
                            }
                            if (concrete) {
                                return type;
                            }
                            return SyntheticType.struct(evaluatedStructContents);
                        }
                        case TypeKind.functionSignature:
                            // need a more lean version of functionParameter
                            const params : cfFunctionSignatureParam[] = [...type.params];
                            for (let i = 0; i < type.params.length; i++) {
                                if (!params[i].type) {
                                    throw "no type for parameter " + i; /// can we get here? parser / binder should convert this to any before we get here...
                                }
                                params[i].type = typeWorker(params[i].type!);
                            }
                            const returns = typeWorker(type.returns);
                            return cfFunctionSignature(type.uiName, params, returns);
                        case TypeKind.typeConstructorInvocation: {
                            const typeConstructor = typeWorker(type.left);
                            if (typeConstructor.typeKind === TypeKind.never) {
                                return typeConstructor;
                            }

                            unsafeAssertTypeKind<cfTypeConstructor>(typeConstructor);

                            if (type.args.length === 0) {
                                typeErrorAtNode(type.left, `Type argument list cannot be empty.`);
                                return SyntheticType.never();
                            }
                            if (typeConstructor.params.length != type.args.length) {
                                typeErrorAtNode(type.left, `Type requires ${typeConstructor.params.length} arguments.`);
                                return SyntheticType.never();
                            }

                            const args : Type[] = [];
                            for (const arg of type.args) {
                                if (arg.typeKind === TypeKind.typeId) {
                                    args.push(typeWorker(typeParamMap.get(arg.uiName) || walkUpContainersToFindType(context, arg) || SyntheticType.any()));
                                }
                                else {
                                    args.push(typeWorker(arg));
                                }
                            }
                
                            const cachedTypeCall = getCachedTypeConstructorInvocation(typeConstructor as cfTypeConstructor, args);
                            if (cachedTypeCall.status === TypeCache_Status.resolved) {
                                return cachedTypeCall.value;
                            }
                            else if (cachedTypeCall.status === TypeCache_Status.resolving) {
                                return cfCachedTypeConstructorInvocation(typeConstructor as cfTypeConstructor, args);
                            }
                            else {
                                return invokeTypeConstructor(typeConstructor as cfTypeConstructor, args);
                            }
                        }
                        case TypeKind.cachedTypeConstructorInvocation: {
                            const cachedTypeCall = getCachedTypeConstructorInvocation(type.left, type.args);
                            if (cachedTypeCall.status === TypeCache_Status.resolved) {
                                return cachedTypeCall.value;
                            }
                            else if (cachedTypeCall.status === TypeCache_Status.resolving) {
                                return type;
                            }
                            else {
                                throw "expected resolved or resolving cache result but got none";
                            }
                        }
                        case TypeKind.typeId: {
                            // @fixme: should error if we can't find it; and return never ?
                            const result = typeParamMap.get(type.uiName) || walkUpContainersToFindType(context, type) || null;
                            if (!result) return cfNever();
                            return typeWorker(result);
                        }
                        default:
                            return type;
                    }
                })();
                depth--;
                return result;
            }
        }

        return evaluateType;
    })();

    return {
        check,
        getCachedEvaluatedNodeType: getCachedEvaluatedNodeTypeImpl,
        setNoUndefinedVars,
    }
}

export type Checker = ReturnType<typeof Checker>;
