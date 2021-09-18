import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { Parser, Binder, cfmOrCfc, SourceFile, flattenTree, Checker, CfFileType } from "../src/compiler";
import { LanguageVersion } from "../src/compiler/project";

const expectedDiagnosticCountByFile : Record<string, number> = {
    "./mxunit/mxunit-TestCase-Template.cfc": 0,
    "./mxunit/mxunit-TestSuiteTemplate.cfm": 0,
    "./mxunit/doc/build.cfm": 0,
    "./mxunit/doc/colddoc/ColdDoc.cfc": 0,
    "./mxunit/doc/colddoc/strategy/AbstractTemplateStrategy.cfc": 0,
    "./mxunit/doc/colddoc/strategy/api/HTMLAPIStrategy.cfc": 0,
    "./mxunit/doc/colddoc/strategy/uml2tools/XMIStrategy.cfc": 0,
    "./mxunit/framework/Assert.cfc": 0,
    "./mxunit/framework/ComponentBlender.cfc": 0,
    "./mxunit/framework/ComponentUtils.cfc": 0,
    "./mxunit/framework/ConfigManager.cfc": 0,
    "./mxunit/framework/CSVUtility.cfc": 0,
    "./mxunit/framework/DataCompare.cfc": 0,
    "./mxunit/framework/DataproviderHandler.cfc": 0,
    "./mxunit/framework/Formatters.cfc": 0,
    "./mxunit/framework/HamcrestAssert.cfc": 0,
    "./mxunit/framework/HamcrestMatcher.cfc": 0,
    "./mxunit/framework/HtmlTestResult.cfc": 0,
    "./mxunit/framework/JUnitXMLTestResult.cfc": 0,
    "./mxunit/framework/mail.cfc": 0,
    "./mxunit/framework/MockFactoryFactory.cfc": 0,
    "./mxunit/framework/MXUnitAssertionExtensions.cfc": 0,
    "./mxunit/framework/POIUtility.cfc": 0,
    "./mxunit/framework/PublicProxyMaker.cfc": 0,
    "./mxunit/framework/QueryTestResult.cfc": 0,
    "./mxunit/framework/RemoteFacade.cfc": 0,
    "./mxunit/framework/RemoteFacadeObjectCache.cfc": 0,
    "./mxunit/framework/Test.cfc": 0,
    "./mxunit/framework/TestCase.cfc": 0,
    "./mxunit/framework/TestDecorator.cfc": 0,
    "./mxunit/framework/TestResult.cfc": 0,
    "./mxunit/framework/TestSuite.cfc": 0,
    "./mxunit/framework/TestSuiteRunner.cfc": 0,
    "./mxunit/framework/TextTestResult.cfc": 0,
    "./mxunit/framework/VersionReader.cfc": 0,
    "./mxunit/framework/XMLTestResult.cfc": 0,
    "./mxunit/framework/XPathAssert.cfc": 0,
    "./mxunit/framework/adapters/cf9/PublicProxyMaker.cfc": 0,
    "./mxunit/framework/decorators/AlphabeticallyOrderedTestsDecorator.cfc": 0,
    "./mxunit/framework/decorators/DataProviderDecorator.cfc": 0,
    "./mxunit/framework/decorators/OrderedTestDecorator.cfc": 0,
    "./mxunit/framework/decorators/TransactionRollbackDecorator.cfc": 0,
    "./mxunit/framework/ext/AssertionExtensionTemplate.cfc": 0,
    "./mxunit/framework/javaloader/JavaCompiler.cfc": 0,
    "./mxunit/framework/javaloader/JavaLoader.cfc": 0,
    "./mxunit/framework/javaloader/JavaProxy.cfc": 0,
    "./mxunit/framework/mightymock/AbstractMock.cfc": 0,
    "./mxunit/framework/mightymock/ArgumentMatcher.cfc": 0,
    "./mxunit/framework/mightymock/MightyMock.cfc": 0,
    "./mxunit/framework/mightymock/MightyMockFactory.cfc": 0,
    "./mxunit/framework/mightymock/MockDebug.cfc": 0,
    "./mxunit/framework/mightymock/MockFactory.cfc": 0,
    "./mxunit/framework/mightymock/MockLogger.cfc": 0,
    "./mxunit/framework/mightymock/MockRegistry.cfc": 0,
    "./mxunit/framework/mightymock/OrderedExpectation.cfc": 0,
    "./mxunit/framework/mightymock/Verifier.cfc": 0,
    "./mxunit/generator/Application.cfm": 0,
    "./mxunit/generator/generate.cfm": 0,
    "./mxunit/generator/index.cfm": 0,
    "./mxunit/generator/lib_cfscript.cfm": 0,
    "./mxunit/generator/listFiles.cfm": 4, // a no longer valid use of taglike call statement cfparam("foo","bar"), where it now appears named arguments are required
    "./mxunit/PluginDemoTests/CFScriptExpectedExceptionTest.cfc": 0,
    "./mxunit/PluginDemoTests/CompareDialogTest.cfc": 0,
    "./mxunit/PluginDemoTests/ComplexExceptionTypeErrorTest.cfc": 0,
    "./mxunit/PluginDemoTests/DoubleMethodTest.cfc": 0,
    "./mxunit/PluginDemoTests/EmptyTest.cfc": 0,
    "./mxunit/PluginDemoTests/ExpectedExceptionTest.cfc": 0,
    "./mxunit/PluginDemoTests/FiveSecondTest.cfc": 0,
    "./mxunit/PluginDemoTests/HodgePodgeTest.cfc": 0,
    "./mxunit/PluginDemoTests/InvalidMarkupTest.cfc": 1,
    "./mxunit/PluginDemoTests/PrivateMethodTest.cfc": 0,
    "./mxunit/PluginDemoTests/run.cfm": 0,
    "./mxunit/PluginDemoTests/SingleFailureTest.cfc": 0,
    "./mxunit/PluginDemoTests/SingleMethodTest.cfc": 0,
    "./mxunit/PluginDemoTests/SomeObject.cfc": 0,
    "./mxunit/PluginDemoTests/ThrowsAnErrorTest.cfc": 0,
    "./mxunit/PluginDemoTests/inheritance/BaseTest.cfc": 0,
    "./mxunit/PluginDemoTests/inheritance/SomeDoublyExtendingTest.cfc": 0,
    "./mxunit/PluginDemoTests/inheritance/SomeExtendingTest.cfc": 0,
    "./mxunit/PluginDemoTests/SubDir/CFUnitStyleTest.cfc": 0,
    "./mxunit/PluginDemoTests/SubDir/AnotherSubDir/AnotherTest.cfc": 0,
    "./mxunit/PluginDemoTests/SubDir/AnotherSubDir/SomeComponentWithStuff.cfc": 0,
    "./mxunit/PluginDemoTests/SubDir/AnotherSubDir/SomeOtherTest.cfc": 0,
    "./mxunit/PluginDemoTests/SubDir/AnotherSubDir/TestSomething.cfc": 0,
    "./mxunit/PluginDemoTests/TestOrdering/AlphabeticallyOrderedTest.cfc": 0,
    "./mxunit/PluginDemoTests/TestOrdering/DefaultOrderedTest.cfc": 0,
    "./mxunit/PluginDemoTests/weirderrordemos/BustedConstructorTest.cfc": 0,
    "./mxunit/PluginDemoTests/weirderrordemos/BustedSetupTest.cfc": 0,
    "./mxunit/PluginDemoTests/weirderrordemos/BustedTearDownTest.cfc": 0,
    "./mxunit/PluginDemoTests/weirderrordemos/extends/Extends.cfc": 0,
    "./mxunit/PluginDemoTests/weirderrordemos/extends/SomeTest.cfc": 0,
    "./mxunit/resources/jquery/spark.cfm": 0,
    "./mxunit/resources/theme/footer.cfm": 0,
    "./mxunit/resources/theme/header.cfm": 0,
    "./mxunit/runner/DirectoryTestSuite.cfc": 0,
    "./mxunit/runner/HtmlRunner.cfc": 0,
    "./mxunit/runner/HttpAntRunner.cfc": 0,
    "./mxunit/runner/index.cfm": 0,
    "./mxunit/runner/RunnerUtils.cfc": 0,
    "./mxunit/samples/DirectoryTestSuiteSample.cfm": 0,
    "./mxunit/samples/HttpAntRunner.cfc": 0,
    "./mxunit/samples/MyComponent.cfc": 0,
    "./mxunit/samples/MyComponentTest.cfc": 0,
    "./mxunit/samples/MyOtherComponentTest.cfc": 0,
    "./mxunit/samples/MyTestSuite.cfm": 0,
    "./mxunit/samples/PluginSimulator.cfm": 0,
    "./mxunit/samples/RemoteFacadeTester.cfm": 0,
    "./mxunit/samples/samples.cfm": 0,
    "./mxunit/samples/ScheduledRun.cfm": 0,
    "./mxunit/samples/SimpleRunSkeleton.cfm": 0,
    "./mxunit/samples/TestCaseSkeleton.cfc": 0,
    "./mxunit/samples/mocking/querysim.cfm": 0,
    "./mxunit/samples/mocking/TheCollaborator.cfc": 0,
    "./mxunit/samples/mocking/TheComponent.cfc": 0,
    "./mxunit/samples/mocking/TheMockTest.cfc": 0,
    "./mxunit/samples/mocking/TheStubTest.cfc": 0,
    "./mxunit/samples/tests/MyComponentTest.cfc": 0,
    "./mxunit/samples/tests/myTestSuite.cfm": 0,
    "./mxunit/samples/tests/TestCaseSkeletonTest.cfc": 0,
    "./mxunit/tests/run.cfm": 0,
    "./mxunit/tests/bugs/105.cfc": 0,
    "./mxunit/tests/bugs/105ExtendedTest.cfc": 0,
    "./mxunit/tests/bugs/149Test.cfc": 0,
    "./mxunit/tests/bugs/80.cfc": 0,
    "./mxunit/tests/bugs/90.cfc": 0,
    "./mxunit/tests/bugs/93.cfc": 0,
    "./mxunit/tests/bugs/Bug115.cfc": 0,
    "./mxunit/tests/bugs/bug126.cfc": 0,
    "./mxunit/tests/bugs/ExpectedExceptionBug147Test.cfc": 0,
    "./mxunit/tests/bugs/fixture/93sample.cfc": 0,
    "./mxunit/tests/bugs/fixture/test-with_hyphen.cfc": 0,
    "./mxunit/tests/bugs/fixture/test_with_underscore.cfc": 0,
    "./mxunit/tests/bugs/fixture/122/GoodTest.cfc": 0,
    "./mxunit/tests/bugs/fixture/122/ParseErrorTest.cfc": 1,
    "./mxunit/tests/bugs/run-me/test-with_hyphen.cfc": 0,
    "./mxunit/tests/bugs/run-me/test_with_underscore.cfc": 0,
    "./mxunit/tests/compatability/DeepStructureCompareTest.cfc": 0,
    "./mxunit/tests/compatability/DoesNotHaveTestAtEndOrBegining.cfc": 0,
    "./mxunit/tests/framework/AssertDecoratorTest.cfc": 0,
    "./mxunit/tests/framework/AssertionChainingTest.cfc": 0,
    "./mxunit/tests/framework/AssertSameTest.cfc": 0,
    "./mxunit/tests/framework/AssertTest.cfc": 0,
    "./mxunit/tests/framework/ComponentBlenderTest.cfc": 0,
    "./mxunit/tests/framework/ComponentUtilsTest.cfc": 0,
    "./mxunit/tests/framework/ConfigManagerTest.cfc": 0,
    "./mxunit/tests/framework/CSVUtilityTest.cfc": 0,
    "./mxunit/tests/framework/DataProviderTest.cfc": 0,
    "./mxunit/tests/framework/DynamicTestCaseGenerationTest.cfc": 2, // they have a <cfscript> tag in a component preamble, is that legit ?
    "./mxunit/tests/framework/ExpectedExceptionTest.cfc": 0,
    "./mxunit/tests/framework/HamcrestMatcherTest.cfc": 0,
    "./mxunit/tests/framework/HamcrestTest.cfc": 0,
    "./mxunit/tests/framework/HtmlTestResultTest.cfc": 0,
    "./mxunit/tests/framework/MockIntegrationTest.cfc": 0,
    "./mxunit/tests/framework/MXUnitAssertionExtensionsTest.cfc": 0,
    "./mxunit/tests/framework/PublicProxyMakerTest.cfc": 0,
    "./mxunit/tests/framework/querysim.cfm": 0,
    "./mxunit/tests/framework/QueryTestResultTest.cfc": 0,
    "./mxunit/tests/framework/RemoteFacadeObjectCacheTest.cfc": 6, // all errors are associated with the now-illegal use of 'final' as an identifier
    "./mxunit/tests/framework/RemoteFacadeTest.cfc": 0,
    "./mxunit/tests/framework/TagSoupTest.cfc": 0,
    "./mxunit/tests/framework/TestCaseBeforeAfterTest.cfc": 0,
    "./mxunit/tests/framework/TestCaseExtendsTest.cfc": 0,
    "./mxunit/tests/framework/TestCaseTest.cfc": 0,
    "./mxunit/tests/framework/TestDecoratorTest.cfc": 0,
    "./mxunit/tests/framework/TestResultTest.cfc": 0,
    "./mxunit/tests/framework/TestSuiteTest.cfc": 0,
    "./mxunit/tests/framework/TestTest.cfc": 0,
    "./mxunit/tests/framework/VersionReaderTest.cfc": 0,
    "./mxunit/tests/framework/XPathAssertionTest.cfc": 0,
    "./mxunit/tests/framework/adapters/cf9/PublicProxyMakerTest.cfc": 0,
    "./mxunit/tests/framework/fixture/ATestSuite.cfc": 0,
    "./mxunit/tests/framework/fixture/ComparatorTestData.cfc": 0,
    "./mxunit/tests/framework/fixture/ComponentWithPrivateMethods.cfc": 0,
    "./mxunit/tests/framework/fixture/DataProviderFixture.cfc": 0,
    "./mxunit/tests/framework/fixture/MockFactory.cfc": 0,
    "./mxunit/tests/framework/fixture/Mocking.cfc": 0,
    "./mxunit/tests/framework/fixture/mxunit-TestCase-Template.cfc": 0,
    "./mxunit/tests/framework/fixture/MyCFC.cfc": 0,
    "./mxunit/tests/framework/fixture/MyCFCTest.cfc": 0,
    "./mxunit/tests/framework/fixture/NewCFComponent.cfc": 0,
    "./mxunit/tests/framework/fixture/ParentWithPrivateMethods.cfc": 0,
    "./mxunit/tests/framework/fixture/querysim.cfm": 0,
    "./mxunit/tests/framework/fixture/TestAssertComponent.cfc": 0,
    "./mxunit/tests/framework/fixture/TestWithExpectedExceptionAttributes.cfc": 0,
    "./mxunit/tests/framework/fixture/decorators/IgnoreFunnyFunctionsDecorator.cfc": 0,
    "./mxunit/tests/framework/fixture/decorators/StoreTestNameDecorator.cfc": 0,
    "./mxunit/tests/framework/fixture/fixturetests/AnotherRandomTest.cfc": 0,
    "./mxunit/tests/framework/fixture/fixturetests/AnotherRandomTests.cfc": 0,
    "./mxunit/tests/framework/fixture/fixturetests/SomeRandomTest.cfc": 0,
    "./mxunit/tests/framework/fixture/fixturetests/SubClassWithNoMethodsTest.cfc": 0,
    "./mxunit/tests/framework/fixture/fixturetests/SuperClassWithPrivateMethodsTest.cfc": 0,
    "./mxunit/tests/framework/fixture/interfaces/AComponent.cfc": 0,
    "./mxunit/tests/framework/fixture/interfaces/AnInterface.cfc": 0,
    "./mxunit/tests/framework/fixture/interfaces/OtherInterface.cfc": 0,
    "./mxunit/tests/framework/fixture/interfaces/SubInterface.cfc": 0,
    "./mxunit/tests/install/cfcproxytest.cfc": 0,
    "./mxunit/tests/install/fixture/index.cfm": 0,
    "./mxunit/tests/install/fixture/test.cfm": 0,
    "./mxunit/tests/mightymock/AbstractMockTest.cfc": 0,
    "./mxunit/tests/mightymock/ArgumentMatcherTest.cfc": 0,
    "./mxunit/tests/mightymock/BaseTest.cfc": 0,
    "./mxunit/tests/mightymock/BasicMXUnitIntegrationTest.cfc": 0,
    "./mxunit/tests/mightymock/CaseSensitivtyTest.cfc": 0,
    "./mxunit/tests/mightymock/FileDeleterTest.cfc": 0,
    "./mxunit/tests/mightymock/InvocationTest.cfc": 0,
    "./mxunit/tests/mightymock/MightyMockTest.cfc": 0,
    "./mxunit/tests/mightymock/MockDebugTest.cfc": 0,
    "./mxunit/tests/mightymock/MockifyTest.cfc": 0,
    "./mxunit/tests/mightymock/MockInstantiationTest.cfc": 0,
    "./mxunit/tests/mightymock/MockLoggerTest.cfc": 0,
    "./mxunit/tests/mightymock/MockPlayTest.cfc": 0,
    "./mxunit/tests/mightymock/MockRegistryTest.cfc": 0,
    "./mxunit/tests/mightymock/MockVerificationTest.cfc": 0,
    "./mxunit/tests/mightymock/ObjectChainingAndReferenceTest.cfc": 0,
    "./mxunit/tests/mightymock/OrderTest.cfc": 0,
    "./mxunit/tests/mightymock/PatternInvocationTest.cfc": 0,
    "./mxunit/tests/mightymock/QueryNewTest.cfc": 0,
    "./mxunit/tests/mightymock/querysim.cfm": 0,
    "./mxunit/tests/mightymock/ReturnTypeTest.cfc": 0,
    "./mxunit/tests/mightymock/StateTransitionTest.cfc": 0,
    "./mxunit/tests/mightymock/TypeParserTest.cfc": 0,
    "./mxunit/tests/mightymock/VerfierTest.cfc": 0,
    "./mxunit/tests/mightymock/WilcardPatternTest.cfc": 0,
    "./mxunit/tests/mightymock/fixture/AcceptStrictType.cfc": 0,
    "./mxunit/tests/mightymock/fixture/Dummy.cfc": 0,
    "./mxunit/tests/mightymock/fixture/FileDeleter.cfc": 0,
    "./mxunit/tests/mightymock/fixture/Helper.cfc": 0,
    "./mxunit/tests/mightymock/fixture/Logger.cfc": 0,
    "./mxunit/tests/mightymock/fixture/Mockery.cfc": 0,
    "./mxunit/tests/mightymock/fixture/Mockify.cfc": 0,
    "./mxunit/tests/mightymock/fixture/MyComponent.cfc": 0,
    "./mxunit/tests/mightymock/fixture/MySpyObject.cfc": 0,
    "./mxunit/tests/mightymock/fixture/ParentSpyObject.cfc": 0,
    "./mxunit/tests/runner/DirectoryTestSuiteTest.cfc": 0,
    "./mxunit/tests/runner/HTMLRunnerTest.cfc": 0,
    "./mxunit/tests/runner/HttpAntRunnerTest.cfc": 0,
    "./mxunit/tests/samples/MyComponent.cfc": 0,
    "./mxunit/tests/samples/MyComponentTest.cfc": 0,
    "./mxunit/tests/samples/MyOtherComponentTest.cfc": 0,
    "./mxunit/tests/utils/TestBubbleSort.cfc": 0, // during checking: cannot find name assertequals - this is in the parent component
    "./mxunit/utils/BubbleSort.cfc": 0,
};

describe("MX-Unit smoke test", () => {
    const parser = Parser({language: LanguageVersion.lucee5}).setDebug(true); // mxunit looks like it was intended to target lucee
    const binder = Binder().setDebug(true);
    const checker = Checker();

    const libPath = path.resolve("./src/lang-server/server/src/runtimelib/lib.cf2018.d.cfm");
    const stdLib = SourceFile(libPath , CfFileType.dCfm, fs.readFileSync(libPath));
    parser.setSourceFile(stdLib).parse();
    binder.bind(stdLib);
    
    for (const fileBaseName of Object.keys(expectedDiagnosticCountByFile)) {
        const expectedDiagnosticCount = expectedDiagnosticCountByFile[fileBaseName];

        it(`Should parse ${fileBaseName} with exactly ___${expectedDiagnosticCount}___ emitted diagnostics`, () => {
            const absPath = path.resolve(__dirname, fileBaseName);
            const textBuffer = fs.readFileSync(absPath);
            const sourceFile = SourceFile(absPath, cfmOrCfc(absPath)!, textBuffer);
            sourceFile.libRefs.push(stdLib);
            parser.setSourceFile(sourceFile).parse();

            flattenTree(sourceFile); // just make sure it doesn't throw
            binder.bind(sourceFile);
            //checker.check(sourceFile, parser.getScanner(), parser.getDiagnostics());
            
            assert.strictEqual(sourceFile.diagnostics.length, expectedDiagnosticCount, `${fileBaseName} parsed with exactly ${expectedDiagnosticCount} emitted diagnostics`);
        });
    }
});