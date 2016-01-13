/*jshint globalstrict:false, strict:false, maxlen: 500 */
/*global assertTrue, assertFalse, assertNull, assertEqual, assertNotEqual, AQL_EXECUTE, AQL_EXPLAIN */

////////////////////////////////////////////////////////////////////////////////
/// @brief tests for COLLECT w/ COUNT
///
/// @file
///
/// DISCLAIMER
///
/// Copyright 2010-2012 triagens GmbH, Cologne, Germany
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///
/// Copyright holder is triAGENS GmbH, Cologne, Germany
///
/// @author Jan Steemann
/// @author Copyright 2012, triAGENS GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

var jsunity = require("jsunity");
var internal = require("internal");
var errors = internal.errors;
var db = require("@arangodb").db;
var helper = require("@arangodb/aql-helper");
var assertQueryError = helper.assertQueryError;

////////////////////////////////////////////////////////////////////////////////
/// @brief test suite
////////////////////////////////////////////////////////////////////////////////

function optimizerAggregateTestSuite () {
  var c;

  return {
    setUp : function () {
      db._drop("UnitTestsCollection");
      c = db._create("UnitTestsCollection");

      for (var i = 0; i < 2000; ++i) {
        c.save({ group: "test" + (i % 10), value1: i, value2: i % 5 });
      }
    },

    tearDown : function () {
      db._drop("UnitTestsCollection");
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test invalid queries
////////////////////////////////////////////////////////////////////////////////

    testInvalidSyntax : function () {
      assertQueryError(errors.ERROR_QUERY_PARSE.code, "FOR i IN " + c.name() + " AGGREGATE RETURN 1");
      assertQueryError(errors.ERROR_QUERY_PARSE.code, "FOR i IN " + c.name() + " AGGREGATE length = LENGTH(i) RETURN 1");
      assertQueryError(errors.ERROR_QUERY_PARSE.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE RETURN 1");
      assertQueryError(errors.ERROR_QUERY_PARSE.code, "FOR i IN " + c.name() + " COLLECT COUNT AGGREGATE length = LENGTH(i) RETURN 1");
      assertQueryError(errors.ERROR_QUERY_PARSE.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE length = LENGTH(i) WITH COUNT RETURN 1");
      assertQueryError(errors.ERROR_QUERY_PARSE.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE length = LENGTH(i) WITH COUNT INTO x RETURN 1");
      assertQueryError(errors.ERROR_QUERY_PARSE.code, "FOR i IN " + c.name() + " COLLECT WITH COUNT g AGGREGATE length = LENGTH(i) RETURN 1");
      assertQueryError(errors.ERROR_QUERY_PARSE.code, "FOR i IN " + c.name() + " COLLECT class = i.group AGGREGATE WITH COUNT RETURN 1");
      assertQueryError(errors.ERROR_QUERY_PARSE.code, "FOR i IN " + c.name() + " COLLECT class = i.group AGGREGATE length = LENGTH(i) WITH COUNT RETURN 1");
      assertQueryError(errors.ERROR_QUERY_PARSE.code, "FOR i IN " + c.name() + " COLLECT class = i.group AGGREGATE length = LENGTH(i) INTO group RETURN 1");
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test invalid queries
////////////////////////////////////////////////////////////////////////////////

    testInvalidAggregateFunctions : function () {
      assertQueryError(errors.ERROR_QUERY_INVALID_AGGREGATE_EXPRESSION.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE c = 1 RETURN 1");
      assertQueryError(errors.ERROR_QUERY_INVALID_AGGREGATE_EXPRESSION.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE c = i.test RETURN 1");
      assertQueryError(errors.ERROR_QUERY_INVALID_AGGREGATE_EXPRESSION.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE c = i.test + 1 RETURN 1");
      assertQueryError(errors.ERROR_QUERY_INVALID_AGGREGATE_EXPRESSION.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE c = LENGTH(i) + 1 RETURN 1");
      assertQueryError(errors.ERROR_QUERY_INVALID_AGGREGATE_EXPRESSION.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE c = 1 + LENGTH(i) RETURN 1");
      assertQueryError(errors.ERROR_QUERY_INVALID_AGGREGATE_EXPRESSION.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE c = IS_NUMBER(i) RETURN 1");
      assertQueryError(errors.ERROR_QUERY_INVALID_AGGREGATE_EXPRESSION.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE c = IS_STRING(i) RETURN 1");
      assertQueryError(errors.ERROR_QUERY_INVALID_AGGREGATE_EXPRESSION.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE c = IS_ARRAY(i) RETURN 1");
      assertQueryError(errors.ERROR_QUERY_INVALID_AGGREGATE_EXPRESSION.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE c = IS_OBJECT(i) RETURN 1");
      assertQueryError(errors.ERROR_QUERY_INVALID_AGGREGATE_EXPRESSION.code, "FOR i IN " + c.name() + " COLLECT AGGREGATE length = LENGTH(i), c = IS_OBJECT(i) RETURN 1");
      assertQueryError(errors.ERROR_QUERY_INVALID_AGGREGATE_EXPRESSION.code, "FOR i IN " + c.name() + " COLLECT group = i.group AGGREGATE c = IS_OBJECT(i) RETURN 1");
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test aggregate
////////////////////////////////////////////////////////////////////////////////

    testAggregateAll : function () {
      var query = "FOR i IN " + c.name() + " COLLECT group = i.group AGGREGATE length = LENGTH(i.value1), min = MIN(i.value1), max = MAX(i.value1), sum = SUM(i.value1), avg = AVERAGE(i.value1) RETURN { group, length, min, max, sum, avg }";

      var results = AQL_EXECUTE(query);
      assertEqual(10, results.json.length);
      for (var i = 0; i < 10; ++i) {
        assertEqual("test" + i, results.json[i].group);
        assertEqual(200, results.json[i].length);
        assertEqual(i, results.json[i].min);
        assertEqual(1990 + i, results.json[i].max);
        assertEqual(199000 + i * 200, results.json[i].sum);
        assertEqual(995 + i, results.json[i].avg);
      }

      var plan = AQL_EXPLAIN(query).plan;
      // must have a SortNode
      assertNotEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));
      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];

      assertEqual("hash", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(1, collectNode.groups.length);
      assertEqual("group", collectNode.groups[0].outVariable.name);

      assertEqual(5, collectNode.aggregates.length);
      assertEqual("length", collectNode.aggregates[0].outVariable.name);
      assertEqual("LENGTH", collectNode.aggregates[0].type);
      assertEqual("min", collectNode.aggregates[1].outVariable.name);
      assertEqual("MIN", collectNode.aggregates[1].type);
      assertEqual("max", collectNode.aggregates[2].outVariable.name);
      assertEqual("MAX", collectNode.aggregates[2].type);
      assertEqual("sum", collectNode.aggregates[3].outVariable.name);
      assertEqual("SUM", collectNode.aggregates[3].type);
      assertEqual("avg", collectNode.aggregates[4].outVariable.name);
      assertEqual("AVERAGE", collectNode.aggregates[4].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test aggregate
////////////////////////////////////////////////////////////////////////////////

    testAggregateExpression : function () {
      var query = "FOR i IN " + c.name() + " COLLECT group = i.group AGGREGATE length = LENGTH(1), min = MIN(i.value1 + 1), max = MAX(i.value1 * 2) RETURN { group, length, min, max }";

      var results = AQL_EXECUTE(query);
      assertEqual(10, results.json.length);
      for (var i = 0; i < 10; ++i) {
        assertEqual("test" + i, results.json[i].group);
        assertEqual(200, results.json[i].length);
        assertEqual(i + 1, results.json[i].min);
        assertEqual((1990 + i) * 2, results.json[i].max);
      }

      var plan = AQL_EXPLAIN(query).plan;
      // must have a SortNode
      assertNotEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("hash", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(1, collectNode.groups.length);
      assertEqual("group", collectNode.groups[0].outVariable.name);

      assertEqual(3, collectNode.aggregates.length);
      assertEqual("length", collectNode.aggregates[0].outVariable.name);
      assertEqual("LENGTH", collectNode.aggregates[0].type);
      assertEqual("min", collectNode.aggregates[1].outVariable.name);
      assertEqual("MIN", collectNode.aggregates[1].type);
      assertEqual("max", collectNode.aggregates[2].outVariable.name);
      assertEqual("MAX", collectNode.aggregates[2].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test aggregate
////////////////////////////////////////////////////////////////////////////////

    testAggregateAllReferToCollectvariable : function () {
      assertQueryError(errors.ERROR_QUERY_VARIABLE_NAME_UNKNOWN.code, "FOR i IN " + c.name() + " COLLECT group = i.group AGGREGATE length = LENGTH(group) RETURN { group, length }");
      assertQueryError(errors.ERROR_QUERY_VARIABLE_NAME_UNKNOWN.code, "FOR j IN " + c.name() + " COLLECT doc = j AGGREGATE length = LENGTH(doc) RETURN doc");
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test aggregate
////////////////////////////////////////////////////////////////////////////////

    testAggregateFiltered : function () {
      var query = "FOR i IN " + c.name() + " FILTER i.group == 'test4' COLLECT group = i.group AGGREGATE length = LENGTH(i.value1), min = MIN(i.value1), max = MAX(i.value1), sum = SUM(i.value1), avg = AVERAGE(i.value1) RETURN { group, length, min, max, sum, avg }";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual("test4", results.json[0].group);
      assertEqual(200, results.json[0].length);
      assertEqual(4, results.json[0].min);
      assertEqual(1994, results.json[0].max);
      assertEqual(199800, results.json[0].sum);
      assertEqual(999, results.json[0].avg);

      var plan = AQL_EXPLAIN(query).plan;
      // must have a SortNode
      assertNotEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("hash", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(1, collectNode.groups.length);
      assertEqual("group", collectNode.groups[0].outVariable.name);

      assertEqual(5, collectNode.aggregates.length);
      assertEqual("length", collectNode.aggregates[0].outVariable.name);
      assertEqual("LENGTH", collectNode.aggregates[0].type);
      assertEqual("min", collectNode.aggregates[1].outVariable.name);
      assertEqual("MIN", collectNode.aggregates[1].type);
      assertEqual("max", collectNode.aggregates[2].outVariable.name);
      assertEqual("MAX", collectNode.aggregates[2].type);
      assertEqual("sum", collectNode.aggregates[3].outVariable.name);
      assertEqual("SUM", collectNode.aggregates[3].type);
      assertEqual("avg", collectNode.aggregates[4].outVariable.name);
      assertEqual("AVERAGE", collectNode.aggregates[4].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test aggregate
////////////////////////////////////////////////////////////////////////////////

    testAggregateFilteredMulti : function () {
      var query = "FOR i IN " + c.name() + " FILTER i.group >= 'test2' && i.group <= 'test4' COLLECT group = i.group AGGREGATE length = LENGTH(i.value1), min = MIN(i.value1), max = MAX(i.value1), sum = SUM(i.value1), avg = AVERAGE(i.value1) RETURN { group, length, min, max, sum, avg }";

      var results = AQL_EXECUTE(query);
      assertEqual(3, results.json.length);
      for (var i = 2; i <= 4; ++i) {
        assertEqual("test" + i, results.json[i - 2].group);
        assertEqual(200, results.json[i - 2].length);
        assertEqual(i, results.json[i - 2].min);
        assertEqual(1990 + i, results.json[i - 2].max);
        assertEqual(199000 + i * 200, results.json[i - 2].sum);
        assertEqual(995 + i, results.json[i - 2].avg);
      }

      var plan = AQL_EXPLAIN(query).plan;
      // must have a SortNode
      assertNotEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("hash", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(1, collectNode.groups.length);
      assertEqual("group", collectNode.groups[0].outVariable.name);

      assertEqual(5, collectNode.aggregates.length);
      assertEqual("length", collectNode.aggregates[0].outVariable.name);
      assertEqual("LENGTH", collectNode.aggregates[0].type);
      assertEqual("min", collectNode.aggregates[1].outVariable.name);
      assertEqual("MIN", collectNode.aggregates[1].type);
      assertEqual("max", collectNode.aggregates[2].outVariable.name);
      assertEqual("MAX", collectNode.aggregates[2].type);
      assertEqual("sum", collectNode.aggregates[3].outVariable.name);
      assertEqual("SUM", collectNode.aggregates[3].type);
      assertEqual("avg", collectNode.aggregates[4].outVariable.name);
      assertEqual("AVERAGE", collectNode.aggregates[4].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test aggregate
////////////////////////////////////////////////////////////////////////////////

    testAggregateFilteredEmpty : function () {
      var query = "FOR i IN " + c.name() + " FILTER i.group >= 'test99' COLLECT group = i.group AGGREGATE length = LENGTH(i.value1), min = MIN(i.value1), max = MAX(i.value1), sum = SUM(i.value1), avg = AVERAGE(i.value1) RETURN { group, length, min, max, sum, avg }";

      var results = AQL_EXECUTE(query);
      assertEqual(0, results.json.length);

      var plan = AQL_EXPLAIN(query).plan;
      // must have a SortNode
      assertNotEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("hash", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(1, collectNode.groups.length);
      assertEqual("group", collectNode.groups[0].outVariable.name);

      assertEqual(5, collectNode.aggregates.length);
      assertEqual("length", collectNode.aggregates[0].outVariable.name);
      assertEqual("LENGTH", collectNode.aggregates[0].type);
      assertEqual("min", collectNode.aggregates[1].outVariable.name);
      assertEqual("MIN", collectNode.aggregates[1].type);
      assertEqual("max", collectNode.aggregates[2].outVariable.name);
      assertEqual("MAX", collectNode.aggregates[2].type);
      assertEqual("sum", collectNode.aggregates[3].outVariable.name);
      assertEqual("SUM", collectNode.aggregates[3].type);
      assertEqual("avg", collectNode.aggregates[4].outVariable.name);
      assertEqual("AVERAGE", collectNode.aggregates[4].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test aggregate
////////////////////////////////////////////////////////////////////////////////

    testAggregateFilteredBig : function () {
      var i;
      for (i = 0; i < 10000; ++i) {
        c.save({ age: 10 + (i % 80), type: 1 });
      }
      for (i = 0; i < 10000; ++i) {
        c.save({ age: 10 + (i % 80), type: 2 });
      }

      var query = "FOR i IN " + c.name() + " FILTER i.age >= 20 && i.age < 50 && i.type == 1 COLLECT AGGREGATE length = LENGTH(i) RETURN length";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual(125 * 30, results.json[0]);

      var plan = AQL_EXPLAIN(query).plan;
      // must not have a SortNode
      assertEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("sorted", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(0, collectNode.groups.length);

      assertEqual(1, collectNode.aggregates.length);
      assertEqual("length", collectNode.aggregates[0].outVariable.name);
      assertEqual("LENGTH", collectNode.aggregates[0].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test aggregate
////////////////////////////////////////////////////////////////////////////////

    testAggregateNested : function () {
      var query = "FOR i IN 1..2 FOR j IN " + c.name() + " COLLECT AGGREGATE length = LENGTH(j) RETURN length";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual(4000, results.json[0]);

      var plan = AQL_EXPLAIN(query).plan;
      // must not have a SortNode
      assertEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("sorted", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(0, collectNode.groups.length);

      assertEqual(1, collectNode.aggregates.length);
      assertEqual("length", collectNode.aggregates[0].outVariable.name);
      assertEqual("LENGTH", collectNode.aggregates[0].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test aggregate
////////////////////////////////////////////////////////////////////////////////

    testAggregateSimple : function () {
      var query = "FOR i IN " + c.name() + " COLLECT class = i.group AGGREGATE length = LENGTH(i) RETURN [ class, length ]";

      var results = AQL_EXECUTE(query);
      assertEqual(10, results.json.length);
      for (var i = 0; i < results.json.length; ++i) {
        var group = results.json[i];
        assertTrue(Array.isArray(group));
        assertEqual("test" + i, group[0]);
        assertEqual(200, group[1]);
      }

      var plan = AQL_EXPLAIN(query).plan;
      // must have a SortNode
      assertNotEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("hash", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(1, collectNode.groups.length);
      assertEqual("class", collectNode.groups[0].outVariable.name);

      assertEqual(1, collectNode.aggregates.length);
      assertEqual("length", collectNode.aggregates[0].outVariable.name);
      assertEqual("LENGTH", collectNode.aggregates[0].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test aggregate shaped
////////////////////////////////////////////////////////////////////////////////

    testAggregateShaped : function () {
      var query = "FOR j IN " + c.name() + " COLLECT doc = j AGGREGATE length = LENGTH(j) RETURN doc";

      var results = AQL_EXECUTE(query);
      // expectation is that we get 1000 different docs and do not crash (issue #1265)
      assertEqual(2000, results.json.length);

      var plan = AQL_EXPLAIN(query).plan;
      // must have a SortNode
      assertNotEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("hash", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(1, collectNode.groups.length);
      assertEqual("doc", collectNode.groups[0].outVariable.name);

      assertEqual(1, collectNode.aggregates.length);
      assertEqual("length", collectNode.aggregates[0].outVariable.name);
      assertEqual("LENGTH", collectNode.aggregates[0].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test aggregate
////////////////////////////////////////////////////////////////////////////////

    testMultiKey : function () {
      var query = "FOR i IN " + c.name() + " COLLECT group1 = i.group, group2 = i.value2 AGGREGATE length = LENGTH(i.value1) RETURN { group1, group2, length }";

      var results = AQL_EXECUTE(query);
      assertEqual(10, results.json.length);
      for (var i = 0; i < 10; ++i) {
        assertEqual("test" + i, results.json[i].group1);
        assertEqual(i % 5, results.json[i].group2);
        assertEqual(200, results.json[i].length);
      }

      var plan = AQL_EXPLAIN(query).plan;
      // must have a SortNode
      assertNotEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("hash", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(2, collectNode.groups.length);
      assertEqual("group1", collectNode.groups[0].outVariable.name);
      assertEqual("group2", collectNode.groups[1].outVariable.name);

      assertEqual(1, collectNode.aggregates.length);
      assertEqual("length", collectNode.aggregates[0].outVariable.name);
      assertEqual("LENGTH", collectNode.aggregates[0].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test aggregate
////////////////////////////////////////////////////////////////////////////////

    testCross : function () {
      var query = "FOR i IN " + c.name() + " COLLECT group = i.group AGGREGATE total = LENGTH(1), c100 = SUM(i.value1 >= 100 ? 1 : 0), c500 = SUM(i.value1 >= 500 ? 1 : 0), c1000 = SUM(i.value1 >= 1000 ? 1 : null) RETURN { group, total, c100, c500, c1000 }";

      var results = AQL_EXECUTE(query);
      assertEqual(10, results.json.length);
      for (var i = 0; i < 10; ++i) {
        assertEqual("test" + i, results.json[i].group);
        assertEqual(200, results.json[i].total);
        assertEqual(190, results.json[i].c100);
        assertEqual(150, results.json[i].c500);
        assertEqual(100, results.json[i].c1000);
      }

      var plan = AQL_EXPLAIN(query).plan;
      // must have a SortNode
      assertNotEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("hash", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(1, collectNode.groups.length);
      assertEqual("group", collectNode.groups[0].outVariable.name);

      assertEqual(4, collectNode.aggregates.length);
      assertEqual("total", collectNode.aggregates[0].outVariable.name);
      assertEqual("LENGTH", collectNode.aggregates[0].type);
      assertEqual("c100", collectNode.aggregates[1].outVariable.name);
      assertEqual("SUM", collectNode.aggregates[1].type);
      assertEqual("c500", collectNode.aggregates[2].outVariable.name);
      assertEqual("SUM", collectNode.aggregates[2].type);
      assertEqual("c1000", collectNode.aggregates[3].outVariable.name);
      assertEqual("SUM", collectNode.aggregates[3].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test min
////////////////////////////////////////////////////////////////////////////////

    testMinEmpty : function () {
      var query = "FOR i IN [ ] COLLECT AGGREGATE m = MIN(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN MIN([ ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test min
////////////////////////////////////////////////////////////////////////////////

    testMinOnlyNull : function () {
      var query = "FOR i IN [ null, null, null, null ] COLLECT AGGREGATE m = MIN(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN MIN([ null, null, null, null ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test min
////////////////////////////////////////////////////////////////////////////////

    testMinMixed : function () {
      var query = "FOR i IN [ 'foo', 'bar', 'baz', true, 'bachelor', null, [ ], false, { }, { zzz: 15 }, { zzz: 2 }, 9999, -9999 ] COLLECT AGGREGATE m = MIN(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual(false, results.json[0]);

      var plan = AQL_EXPLAIN(query).plan;
      // must not have a SortNode
      assertEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("sorted", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(0, collectNode.groups.length);

      assertEqual(1, collectNode.aggregates.length);
      assertEqual("m", collectNode.aggregates[0].outVariable.name);
      assertEqual("MIN", collectNode.aggregates[0].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test min
////////////////////////////////////////////////////////////////////////////////

    testMinStrings : function () {
      var query = "FOR i IN [ 'foo', 'bar', 'baz', 'bachelor' ] COLLECT AGGREGATE m = MIN(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual('bachelor', results.json[0]);

      var plan = AQL_EXPLAIN(query).plan;
      // must not have a SortNode
      assertEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("sorted", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(0, collectNode.groups.length);

      assertEqual(1, collectNode.aggregates.length);
      assertEqual("m", collectNode.aggregates[0].outVariable.name);
      assertEqual("MIN", collectNode.aggregates[0].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test max
////////////////////////////////////////////////////////////////////////////////

    testMaxEmpty : function () {
      var query = "FOR i IN [ ] COLLECT AGGREGATE m = MAX(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN MAX([ ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test max
////////////////////////////////////////////////////////////////////////////////

    testMaxOnlyNull : function () {
      var query = "FOR i IN [ null, null, null, null ] COLLECT AGGREGATE m = MAX(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN MAX([ null, null, null, null ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test max
////////////////////////////////////////////////////////////////////////////////

    testMaxMixed : function () {
      var query = "FOR i IN [ 'foo', 'bar', 'baz', true, 'bachelor', null, [ ], false, { }, { zzz: 15 }, { zzz : 2 }, 9999, -9999 ] COLLECT AGGREGATE m = MAX(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual({ zzz : 15 }, results.json[0]);

      var plan = AQL_EXPLAIN(query).plan;
      // must not have a SortNode
      assertEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("sorted", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(0, collectNode.groups.length);

      assertEqual(1, collectNode.aggregates.length);
      assertEqual("m", collectNode.aggregates[0].outVariable.name);
      assertEqual("MAX", collectNode.aggregates[0].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test max
////////////////////////////////////////////////////////////////////////////////

    testMaxStrings : function () {
      var query = "FOR i IN [ 'foo', 'bar', 'baz', 'bachelor' ] COLLECT AGGREGATE m = MAX(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual('foo', results.json[0]);

      var plan = AQL_EXPLAIN(query).plan;
      // must not have a SortNode
      assertEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("sorted", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(0, collectNode.groups.length);

      assertEqual(1, collectNode.aggregates.length);
      assertEqual("m", collectNode.aggregates[0].outVariable.name);
      assertEqual("MAX", collectNode.aggregates[0].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test sum
////////////////////////////////////////////////////////////////////////////////

    testSumEmpty : function () {
      var query = "FOR i IN [ ] COLLECT AGGREGATE m = SUM(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      // notable difference: regular SUM([ ]) returns 0, but as an aggregate
      // function it returns null
      assertEqual(0, AQL_EXECUTE("RETURN SUM([ ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test sum
////////////////////////////////////////////////////////////////////////////////

    testSumOnlyNull : function () {
      var query = "FOR i IN [ null, null, null, null ] COLLECT AGGREGATE m = SUM(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual(0, results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN SUM([ null, null, null, null ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test sum
////////////////////////////////////////////////////////////////////////////////

    testSumMixed : function () {
      var query = "FOR i IN [ 'foo', 'bar', 'baz', true, 'bachelor', null, [ ], false, { }, { zzz: 1 }, { aaa : 2 }, 9999, -9999 ] COLLECT AGGREGATE m = SUM(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);

      var plan = AQL_EXPLAIN(query).plan;
      // must not have a SortNode
      assertEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("sorted", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(0, collectNode.groups.length);

      assertEqual(1, collectNode.aggregates.length);
      assertEqual("m", collectNode.aggregates[0].outVariable.name);
      assertEqual("SUM", collectNode.aggregates[0].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test sum
////////////////////////////////////////////////////////////////////////////////

    testSumNumbers : function () {
      var values = [ 1, 42, 23, 19.5, 4, -28 ];
      var expected = values.reduce(function(a, b) { return a + b; }, 0);
      var query = "FOR i IN " + JSON.stringify(values) + " COLLECT AGGREGATE m = SUM(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual(expected, results.json[0]);
      assertEqual(expected, AQL_EXECUTE("RETURN SUM(" + JSON.stringify(values) + ")").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test avg
////////////////////////////////////////////////////////////////////////////////

    testAvgEmpty : function () {
      var query = "FOR i IN [ ] COLLECT AGGREGATE m = AVERAGE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN AVERAGE([ ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test avg
////////////////////////////////////////////////////////////////////////////////

    testAvgOnlyNull : function () {
      var query = "FOR i IN [ null, null, null, null ] COLLECT AGGREGATE m = AVERAGE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN AVERAGE([ null, null, null, null ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test avg
////////////////////////////////////////////////////////////////////////////////

    testAvgSingle : function () {
      var query = "FOR i IN [ -42.5 ] COLLECT AGGREGATE m = AVERAGE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual(-42.5, results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN AVERAGE([ -42.5 ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test avg
////////////////////////////////////////////////////////////////////////////////

    testAvgSingleString : function () {
      var query = "FOR i IN [ '-42.5foo' ] COLLECT AGGREGATE m = AVERAGE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN AVERAGE([ '-42.5foo' ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test avg
////////////////////////////////////////////////////////////////////////////////

    testAvgSingleWithNulls : function () {
      var query = "FOR i IN [ -42.5, null, null, null ] COLLECT AGGREGATE m = AVERAGE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual(-42.5, results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN AVERAGE([ -42.5, null, null, null ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test avg
////////////////////////////////////////////////////////////////////////////////

    testAvgMixed : function () {
      var query = "FOR i IN [ 'foo', 'bar', 'baz', true, 'bachelor', null, [ ], false, { }, { zzz: 1 }, { aaa : 2 }, 9999, -9999 ] COLLECT AGGREGATE m = AVERAGE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);

      var plan = AQL_EXPLAIN(query).plan;
      // must not have a SortNode
      assertEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("sorted", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(0, collectNode.groups.length);

      assertEqual(1, collectNode.aggregates.length);
      assertEqual("m", collectNode.aggregates[0].outVariable.name);
      assertEqual("AVERAGE", collectNode.aggregates[0].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test avg
////////////////////////////////////////////////////////////////////////////////

    testAvgNumbers : function () {
      var values = [ 1, 42, 23, 19.5, 4, -28 ];
      var expected = values.reduce(function(a, b) { return a + b; }, 0);
      var query = "FOR i IN " + JSON.stringify(values) + " COLLECT AGGREGATE m = AVERAGE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual(expected / 6, results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN AVERAGE(" + JSON.stringify(values) + ")").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceEmpty : function () {
      var query = "FOR i IN [ ] COLLECT AGGREGATE m = VARIANCE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE([ ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSampleEmpty : function () {
      var query = "FOR i IN [ ] COLLECT AGGREGATE m = VARIANCE_SAMPLE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE_SAMPLE([ ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceOnlyNull : function () {
      var query = "FOR i IN [ null, null, null, null ] COLLECT AGGREGATE m = VARIANCE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE([ null, null, null, null ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSampleOnlyNull : function () {
      var query = "FOR i IN [ null, null, null, null ] COLLECT AGGREGATE m = VARIANCE_SAMPLE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE_SAMPLE([ null, null, null, null ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSingle : function () {
      var query = "FOR i IN [ -42.5 ] COLLECT AGGREGATE m = VARIANCE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual(0, results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE([ -42.5 ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSampleSingle : function () {
      var query = "FOR i IN [ -42.5 ] COLLECT AGGREGATE m = VARIANCE_SAMPLE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE_SAMPLE([ -42.5 ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSampleSingleWithNull : function () {
      var query = "FOR i IN [ -42.5, null ] COLLECT AGGREGATE m = VARIANCE_SAMPLE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE_SAMPLE([ -42.5, null ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSampleTwoValues : function () {
      var query = "FOR i IN [ 19, 23 ] COLLECT AGGREGATE m = VARIANCE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual(4, results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE([ 19, 23 ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSampleSingleTwoValues : function () {
      var query = "FOR i IN [ 19, 23 ] COLLECT AGGREGATE m = VARIANCE_SAMPLE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual(8, results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE_SAMPLE([ 19, 23 ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSingleString : function () {
      var query = "FOR i IN [ '-42.5foo' ] COLLECT AGGREGATE m = VARIANCE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE([ '-42.5foo' ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSampleSingleString : function () {
      var query = "FOR i IN [ '-42.5foo' ] COLLECT AGGREGATE m = VARIANCE_SAMPLE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE_SAMPLE([ '-42.5foo' ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSampleTwoStrings : function () {
      var query = "FOR i IN [ '-42.5foo', '99baz' ] COLLECT AGGREGATE m = VARIANCE_SAMPLE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE_SAMPLE([ '-42.5foo', '99baz' ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSingleWithNulls : function () {
      var query = "FOR i IN [ -42.5, null, null, null ] COLLECT AGGREGATE m = VARIANCE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertEqual(0, results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE([ -42.5, null, null, null ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSampleSingleWithNulls : function () {
      var query = "FOR i IN [ -42.5, null, null, null ] COLLECT AGGREGATE m = VARIANCE_SAMPLE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);
      assertEqual(results.json[0], AQL_EXECUTE("RETURN VARIANCE_SAMPLE([ -42.5, null, null, null ])").json[0]);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceMixed : function () {
      var query = "FOR i IN [ 'foo', 'bar', 'baz', true, 'bachelor', null, [ ], false, { }, { zzz: 1 }, { aaa : 2 }, 9999, -9999 ] COLLECT AGGREGATE m = VARIANCE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertNull(results.json[0]);

      var plan = AQL_EXPLAIN(query).plan;
      // must not have a SortNode
      assertEqual(-1, plan.nodes.map(function(node) { return node.type; }).indexOf("SortNode"));

      var collectNode = plan.nodes[plan.nodes.map(function(node) { return node.type; }).indexOf("CollectNode")];
      assertEqual("sorted", collectNode.collectOptions.method);
      assertFalse(collectNode.count);
      assertFalse(collectNode.isDistinctCommand);

      assertEqual(0, collectNode.groups.length);

      assertEqual(1, collectNode.aggregates.length);
      assertEqual("m", collectNode.aggregates[0].outVariable.name);
      assertEqual("VARIANCE", collectNode.aggregates[0].type);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceNumbers : function () {
      var values = [ 1, 2, 3, 4, null, 23, 42, 19, 32, 44, -34];
      var expected = 495.03999999999996;
      var query = "FOR i IN " + JSON.stringify(values) + " COLLECT AGGREGATE m = VARIANCE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertTrue(Math.abs(expected - results.json[0]) < 0.01);
      assertTrue(Math.abs(results.json[0] - AQL_EXECUTE("RETURN VARIANCE(" + JSON.stringify(values) + ")").json[0]) < 0.01);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSampleNumbers : function () {
      var values = [ 1, 2, 3, 4, null, 23, 42, 19, 32, 44, -34];
      var expected = 550.0444444444444;
      var query = "FOR i IN " + JSON.stringify(values) + " COLLECT AGGREGATE m = VARIANCE_SAMPLE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertTrue(Math.abs(expected - results.json[0]) < 0.01);
      assertTrue(Math.abs(results.json[0] - AQL_EXECUTE("RETURN VARIANCE_SAMPLE(" + JSON.stringify(values) + ")").json[0]) < 0.01);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceNumbersOthers : function () {
      var values = [ 1, 42, 23, 19.5, 4, -28 ];
      var expected = 473.9791666666667;
      var query = "FOR i IN " + JSON.stringify(values) + " COLLECT AGGREGATE m = VARIANCE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertTrue(Math.abs(expected - results.json[0]) < 0.01);
      assertTrue(Math.abs(results.json[0] - AQL_EXECUTE("RETURN VARIANCE(" + JSON.stringify(values) + ")").json[0]) < 0.01);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test variance
////////////////////////////////////////////////////////////////////////////////

    testVarianceSampleNumbersOthers : function () {
      var values = [ 1, 42, 23, 19.5, 4, -28 ];
      var expected = 568.775;
      var query = "FOR i IN " + JSON.stringify(values) + " COLLECT AGGREGATE m = VARIANCE_SAMPLE(i) RETURN m";

      var results = AQL_EXECUTE(query);
      assertEqual(1, results.json.length);
      assertTrue(Math.abs(expected - results.json[0]) < 0.01);
      assertTrue(Math.abs(results.json[0] - AQL_EXECUTE("RETURN VARIANCE_SAMPLE(" + JSON.stringify(values) + ")").json[0]) < 0.01);
    }

  };
}

////////////////////////////////////////////////////////////////////////////////
/// @brief executes the test suite
////////////////////////////////////////////////////////////////////////////////

jsunity.run(optimizerAggregateTestSuite);

return jsunity.done();
