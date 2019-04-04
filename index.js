/* generate HTML forms from ShEx schemas and conformant data
 *
 * TODO: factor SchemaRenderer and ValidationResultsRenderer
 */

(function () {
  const IRI_Rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  const IRI_RdfType = IRI_Rdf + "type"
  const IRI_Xsd = "http://www.w3.org/2001/XMLSchema#"
  const IRI_XsdString = IRI_Xsd + "string"
  const IRI_XsdInteger = IRI_Xsd + "integer"
  const IRI_RdfsLabel = "http://www.w3.org/2000/01/rdf-schema#label"
  const IRI_Layout = "http://janeirodigital.com/layout#"
  const IRI_LayoutReadOnly = IRI_Layout + "readonly"
  let Meta = {
    shexc: {
      prefixes: {},
      base: location.href
    },
    turtle: {
      prefixes: {},
      base: location.href
    }
  }
  Interfaces = [
    // { label: "local",
    //   link: "http://localhost/tmp/checkouts/shexSpec/shex.js/packages/shex-webapp/doc/shex-simple.html?" },
    { label: "js", name: "shex.js",
      link: "http://rawgit.com/shexSpec/shex.js/extends/packages/shex-webapp/doc/shex-simple.html?" },
    { label: "scala", name: "rdfshape",
      link: "http://rdfshape.weso.es/validate?triggerMode=ShapeMap&" }
  ];

  // populate inputs with defaults
  $(".shexc textarea").val(defaultShExC())
  $(".turtle textarea").val(defaultTurtle())
  $(".shexj pre").hide()
  Promise.all([parseShExC(), parseTurtle()]).then(both => {
    updateTryItLink()
    clearCurrentForm()
  })

  // activate editor panel when clicked
  $(".panel pre")
    .height($(".shexc textarea").height())
    .on("click", evt => {
      let panel = $(evt.target).parents(".panel")
      panel.find("pre").hide()
      panel.find("textarea").show()
      clearCurrentForm()
  })

  // re-generate start shape select whenever clicked
  $("#start-shape").on("mousedown", evt => {
    getSchemaPromise().catch(alert)
  }).on("change", clearCurrentForm)

  // re-generate focus node select whenever clicked
  $("#focus-node").on("mousedown", evt => {
    parseTurtle().catch(alert)
  }).on("change", clearCurrentForm)

  // [→] button
  $("#shexc-to-shexj").on("click", evt => {
    $(".shexj textarea").val("")
    getSchemaPromise().catch(alert)
  })

  // [↙] button
  $("#shexj-to-form").on("click", evt => {
    // get schema from ShExJ or ShExC
    let schemaP = getSchemaPromise()
    schemaP.then(
      schema => {
        updateTryItLink()
        $("#form").empty().append( // @@ assumes only one return
          new SchemaRenderer(schema).
            paintShapeExpression($("#start-shape").val())[0]
            .attr("id", "form")
            .addClass("panel")
        )
      },
      alert
    )
  })

  // [←] button
  $("#turtle-to-form").on("click", evt => {
    let schemaP = getSchemaPromise()
    let graphP = parseTurtle()

    Promise.all([schemaP, graphP]).then(both => {
      let [schema, graph] = both
      updateTryItLink()
      let as = shexCore.Util.ShExJtoAS(JSON.parse(JSON.stringify(schema)))
      nowDoing = "validating data"
      let validator = shexCore.Validator.construct(as)
      let db = shexCore.Util.makeN3DB(graph)
      let focus = $("#focus-node").val()
      let results = validator.validate(db, focus, $("#start-shape").val())
      if ("errors" in results) {
        alert("failed to validate, see console")
        console.warn(results)
      } else {
        $("#form").empty().append( // @@ assumes only one return
          new ValidationResultsRenderer(schema).
            paintShapeExpression(results)[0]
            .attr("id", "form")
            .addClass("panel")
        )
      }
    }, alert)
  })

  return

  // try it link

  function updateTryItLink () {
    const span = $(".tryit")
    const parms = getShExApiParms(span)
    span.empty().append(
      Interfaces.reduce(
        (toAdd, iface, idx) => toAdd.concat(
          (idx === 0 ?
           $("<span/>").text("try it: ") :
           " | "),
          $("<a/>", { href: createLink(iface.link, parms) }).text(iface.label),
        ), []
      )
    )
  }

  function getShExApiParms (span) {
    const schema = $(".shexc textarea").val().replace(/^\n +/, "")
    const data = $(".turtle textarea").val().replace(/^\n +/, "")
    const shapeMap = localName($("#focus-node").val(), Meta.turtle)
          + "@"
          + localName($("#start-shape").val(), Meta.shexc)
    return { schema, data, shapeMap }
  }

  function createLink (base, shExApiParms) {
    return base + [
      "interface=minimal",
      "schema=" + encodeURIComponent(shExApiParms.schema),
      "data=" + encodeURIComponent(shExApiParms.data),
      "shape-map=" + encodeURIComponent(shExApiParms.shapeMap)
    ].join("&");
  }

  // node and shape selectors

  function paintShapeChoice (schema) {
    let selected = $("#start-shape").val()
    $("#start-shape").empty().append(schema.shapes.map(
      shape =>
        $("<option/>", Object.assign(
          {value: shape.id},
          shape.id === selected ? { selected: "selected" } : {}
        )).append(localName(shape.id, Meta.shexc))
    ))
    return schema
  }

  function paintNodeChoice (graph) {
    let selected = $("#focus-node").val()
    let nodes = graph.getQuads().reduce(
      (nodes, q) => nodes.find(
        known => known.equals(q.subject)
      )
        ? nodes
        : nodes.concat(q.subject)
      , []
    ).map(
      q => q.termType === "BlankNode"
        ? "_:" + q.value
        : q.value)
    $("#focus-node").empty().append(nodes.map(
      node =>
        $("<option/>", Object.assign(
          {value: node},
          node === selected ? { selected: "selected" } : {}
        )).text(localName(node, Meta.turtle))
    ))
    return graph
  }

  function clearCurrentForm () {
    $("#form").empty().append(" no generated form", $("<br/>"),
                              "   ↙ to create from schema", $("<br/>"),
                              "   ← to create from data")
  }

  // parser wrappers

  function parseShExC () {
    let nowDoing = "Parsing ShExC"
    return new Promise((accept, reject) => {
    let shexcText = $(".shexc textarea").val()
    try {
      let parser = shexParser.construct(location.href)
      let as = parser.parse($(".shexc textarea").val())
      // keep track of prefixes for painting shape menu
      Meta.shexc.prefixes = as.prefixes || {}
      Meta.shexc.base = as.base || location.href
      let schema = shexCore.Util.AStoShExJ(as)
      paintShapeChoice(schema)

      // syntax highlight ShExC
      let result = hljs.highlight("json", shexcText, true)
      $(".shexc .hljs").html(result.value)
      $(".shexc textarea").hide()
      $(".shexc pre").show()

      accept(schema)
    } catch (e) {
      alert(e)
    }
    })
  }

  function getSchemaPromise () {
    return $(".shexj textarea").val().length
      ? parseShExJ()
      : parseShExC().then(renderShExJ)
  }

  function renderShExJ (schema) {
    updateTryItLink()
    let shexjText = JSON.stringify(schema, null, 2)
    $(".shexj pre").hide()
    $(".shexj textarea").val(shexjText).show()
    return schema
  }

  function parseShExJ () {
    let nowDoing = "Parsing ShExJ"
    return new Promise((accept, reject) => {
      let shexj = $(".shexj textarea").val()
      try {
        let schema = JSON.parse(shexj)
        paintShapeChoice(schema)

        // syntax highlight ShExJ
        let result = hljs.highlight("json", shexj, true)
        $(".shexj .hljs").html(result.value)
        $(".shexj textarea").hide()
        $(".shexj pre").show()

        accept(schema)
      } catch (e) {
        reject(e)
      }
    })
  }

  function parseTurtle () {
    let nowDoing = "Parsing N3"
    return new Promise((accept, reject) => {
      N3.Parser._resetBlankNodeIds()
      const parser = new N3.Parser({ baseIRI: location.href })
      const graph = new N3.Store()
      parser.parse(
        $(".turtle textarea").val(),
        (error, quad, prefixes) => {
          if (error)
            reject(error)
          if (quad)
            graph.addQuad(quad)
          else {
            // keep track of prefixes for painting focus menu
            Meta.turtle.prefixes = prefixes
            Meta.turtle.base = parser._base
            paintNodeChoice(graph)

            // syntax highlight Turtle
            let result = hljs.highlight("shexc", $(".turtle textarea").val(), true)
            $(".turtle .hljs").html(result.value)
            $(".turtle textarea").hide()
            $(".turtle pre").show()

            accept(graph)
          }
        }
      )
    })
  }

  // convenience functions

  function findLabel (shexpr) {
    return (shexpr.annotations || []).find(a => a.predicate === IRI_RdfsLabel)
  }

  function localName (iri, meta) {
    if (iri.startsWith("_:"))
      return iri
    let p = Object.keys(meta.prefixes).find(p => iri.startsWith(meta.prefixes[p]))
    if (p)
      return p + ":" + iri.substr(meta.prefixes[p].length)
    return "<" + (iri.startsWith(meta.base) ? iri.substr(meta.base.length) : iri) + ">"
  }

  // Renderers

  // Walk ShExJ to generate a form.
  function SchemaRenderer (schema) {
    const validator = shexCore.Validator.construct(
      // JtoAS modifies original; +1 to working with native ShExJ.
      shexCore.Util.ShExJtoAS(JSON.parse(JSON.stringify(schema)))
    )

    return {
      findShapeExpression: findShapeExpression,

      // get the painters in here.
      paintShapeExpression: paintShapeExpression,
      paintShape: paintShape,
      paintNodeConstraint: paintNodeConstraint,
      paintTripleExpression: paintTripleExpression,
      paintTripleConstraint: paintTripleConstraint,
    }

    function findShapeExpression (goal) {
      return schema.shapes.find(se => se.id === goal)
    }

    /* All paint* functions return an array of jquery nodes.
     */

    function paintShapeExpression (shexpr) {
      if (typeof shexpr === "string")
        return paintShapeExpression(findShapeExpression(shexpr))
      switch (shexpr.type) {
      case "Shape":
        return paintShape(shexpr)
      case "NodeConstraint":
        return paintNodeConstraint(shexpr)
      default: throw Error("paintShapeExpression(" + shexpr.type + ")")
      }
    }

    function paintShape (shexpr) {
      let div = $("<div/>", { class: "form" })
      let label = findLabel(shexpr)
      if (label)
        div.append($("<h3>").text(label.object.value))
      let ul = $("<ul/>").append(paintTripleExpression(shexpr.expression))
      div.append(ul)
      return [div]
    }

    function paintNodeConstraint (nc) {
      if (!("datatype" in nc || "nodeKind" in nc || "values" in nc))
        throw Error("paintNodeConstraint(" + JSON.stringify(nc, null, 2) + ")")

      function validatedInput (makeTerm) {
        return $("<input/>").on("blur", evt => {
          let jElt = $(evt.target)
          let lexicalValue = jElt.val()
          let res = validator._validateShapeExpr(null, makeTerm(lexicalValue), nc, "", null, {})
          if ("errors" in res) {
            console.warn(res)
            jElt.addClass("error").attr("title", res.errors.map(e => e.error).join("\n--\n"))
          } else {
            jElt.removeClass("error").removeAttr("title")
          }
        })
      }

      if ("datatype" in nc)
        switch (nc.datatype) {
        case IRI_XsdString:
        case IRI_XsdInteger:
          return [validatedInput(s => "\"" + s.replace(/"/g, "\\\"") + "\"^^" + nc.datatype)]
        default:
          throw Error("paintNodeConstraint({datatype: " + nc.datatype + "})")
        }

      if ("nodeKind" in nc)
        switch (nc.nodeKind) {
        case "iri" : 
          return [validatedInput(s => s)] // JSON-LD IRIs are expressed directly as strings.
        default:
          throw Error("paintNodeConstraint({nodeKind: " + nc.nodeKind + "})")
        }

      if ("values" in nc)
        return [$("<select/>").append(nc.values.map(v => {
          let vStr = typeof v === "object"
              ? v.value      // a string
              : localName(v, Meta.shexc) // an IRI
          return $("<option/>", {value: vStr}).text(vStr)
        }))]

      throw Error("ProgramFlowError: paintNodeConstraint arrived at bottom")
    }

    function paintTripleExpression (texpr) {
      if (typeof texpr === "string")
        return paintTripleExpression(findTripleExpression(texpr)) // @@ later
      switch (texpr.type) {
      case "TripleConstraint":
        return paintTripleConstraint(texpr)
      case "EachOf":
        return texpr.expressions.reduce(
          (acc, nested) =>
            acc.concat(paintTripleExpression (nested)), []
        )
      case "OneOf":
        return $("<li/>", { class: "disjunction" }).append(
          $("<ul/>").append(
            texpr.expressions.reduce(
              (acc, e, idx) =>
                (idx > 0
                 ? acc.concat($("<li/>", {class: "separator"}).append("<hr/>"))
                 : acc
                ).concat(paintTripleExpression(e)),
              []
            )
          )
        )
      default: throw Error("paintTripleExpression(" + texpr.type + ")")
      }
    }

    function paintTripleConstraint (tc) {
      let label = findLabel(tc);
      let ret = $("<li/>").text(label ? label.object.value : tc.predicate === IRI_RdfType ? "a" : localName(tc.predicate, Meta.shexc))
      if (typeof tc.max !== "undefined" && tc.max !== 1)
        ret.append([" ", $("<span/>", { class: "add" }).text("+")])
      if (tc.valueExpr) {
        let valueHtml = paintShapeExpression(tc.valueExpr)
        let ro = (tc.annotations || []).find(a => a.predicate === IRI_LayoutReadOnly)
        if (ro)
          valueHtml.forEach(h => h.attr("readonly", "readonly"))
        ret.append(valueHtml)
      }
      return [ret]
    }
  }

  // Walk a validation result to generate a form.
  function ValidationResultsRenderer (schema) {
    const validator = shexCore.Validator.construct(
      // JtoAS modifies original; +1 to working with native ShExJ.
      shexCore.Util.ShExJtoAS(JSON.parse(JSON.stringify(schema)))
    )

    return {
      // get the painters in here.
      paintShapeExpression: paintShapeExpression,
      paintShape: paintShape,
      paintNodeConstraint: paintNodeConstraint,
      paintTripleExpression: paintTripleExpression,
      paintTripleConstraint: paintTripleConstraint,
    }

    function findShapeExpression (goal) {
      return schema.shapes.find(se => se.id === goal)
    }

    /* All paint* functions return an array of jquery nodes.
     */

    function paintShapeExpression (shexpr, tested) {
      if (shexpr.type === "ShapeRef")
        return tested.referenced
        ? paintShapeExpression(tested.referenced)
        : paintNodeConstraint(findShapeExpression(shexpr.reference), tested)
      switch (shexpr.type) {
      case "ShapeTest":
        return paintShape(shexpr, tested)
      case "NodeConstraint":
        return paintNodeConstraint(shexpr, tested)
      default: throw Error("paintShapeExpression(" + shexpr.type + ")")
      }
    }

    function paintShape (shexpr) {
      let div = $("<div/>", { class: "form" })
      let label = findLabel(shexpr)
      if (label)
        div.append($("<h3>").text(label.object.value))
      let ul = $("<ul/>").append(paintTripleExpression(shexpr.solution))
      div.append(ul)
      return [div]
    }

    function paintNodeConstraint (nc, value) {
      if (!("datatype" in nc || "nodeKind" in nc || "values" in nc))
        throw Error("paintNodeConstraint(" + JSON.stringify(nc, null, 2) + ")")

      function validatedInput (makeTerm) {
        return $("<input/>").on("blur", evt => {
          let jElt = $(evt.target)
          let lexicalValue = jElt.val()
          let res = validator._validateShapeExpr(null, makeTerm(lexicalValue), nc, "", null, {})
          if ("errors" in res) {
            console.warn(res)
            jElt.addClass("error").attr("title", res.errors.map(e => e.error).join("\n--\n"))
          } else {
            jElt.removeClass("error").removeAttr("title")
          }
        })
      }

      if ("datatype" in nc)
        switch (nc.datatype) {
        case IRI_XsdString:
        case IRI_XsdInteger:
          return [validatedInput(s => "\"" + s.replace(/"/g, "\\\"") + "\"^^" + nc.datatype).val(value.object.value)]
        default:
          throw Error("paintNodeConstraint({datatype: " + nc.datatype + "})")
        }

      if ("nodeKind" in nc)
        switch (nc.nodeKind) {
        case "iri" : 
          return [validatedInput(s => s).val(value.object)] // JSON-LD IRIs are expressed directly as strings.
        default:
          throw Error("paintNodeConstraint({nodeKind: " + nc.nodeKind + "})")
        }

      if ("values" in nc)
        return [$("<select/>").append(nc.values.map(v => {
          let vStr = typeof v === "object"
              ? v.value      // a string
              : localName(v, Meta.shexc) // an IRI
          let ret = $("<option/>", {value: vStr}).text(vStr)
          let mStr = typeof value.object === "object"
              ? value.object.value      // a string
              : localName(value.object, Meta.shexc) // an IRI
          if (mStr === vStr)
            ret.attr("selected", "selected")
          return ret
        }))]

      throw Error("ProgramFlowError: paintNodeConstraint arrived at bottom")
    }

    function paintTripleExpression (texpr) {
      // if (typeof texpr === "string")
      //   return paintTripleExpression(findTripleExpression(texpr)) // @@ later
      switch (texpr.type) {
      case "TripleConstraintSolutions":
        return paintTripleConstraint(texpr)
      case "EachOfSolutions":
        return texpr.solutions.reduce(
          (acc, nested) =>
            acc.concat(nested.expressions.reduce(
              (acc2, n2) =>
                acc2.concat(paintTripleExpression(n2)), []
            )), []
        )
      case "OneOfSolutions":
        return $("<li/>", { class: "disjunction" }).append(
          $("<ul/>").append(
            texpr.solutions.reduce(
              (acc, e, idx) =>
                (idx > 0
                 ? acc.concat($("<li/>", {class: "separator"}).append("<hr/>"))
                 : acc
                ).concat(e.expressions.reduce(
                  (acc2, n2) =>
                    acc2.concat(paintTripleExpression(n2)), []
                )),
              []
            )
          )
        )
      default: throw Error("paintTripleExpression(" + texpr.type + ")")
      }
    }

    function paintTripleConstraint (tc) {
      let label = findLabel(tc);
      let ret = $("<li/>").text(label ? label.object.value : tc.predicate === IRI_RdfType ? "a" : localName(tc.predicate, Meta.shexc))
      // if (typeof tc.max !== "undefined" && tc.max !== 1)
      //   ret.append([" ", $("<span/>", { class: "add" }).text("+")])
      return [ret.append(tc.solutions.reduce(
        (acc, soln) => {
          if (tc.valueExpr) {
            let valueHtml = paintShapeExpression(tc.valueExpr, soln)
            let ro = (tc.annotations || []).find(a => a.predicate === IRI_LayoutReadOnly)
            if (ro)
              valueHtml.forEach(h => h.attr("readonly", "readonly"))
            return acc.concat(valueHtml)
          } else {
            throw Error("PF")
          }
        }, []))]
    }
  }

  // default text for <inputarea/>s
  function defaultShExC () {
    return `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX vc: <http://www.w3.org/2006/vcard/ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX : <http://janeirodigital.com/layout#>
PREFIX solid: <http://www.w3.org/ns/solid/terms#>

<#UserProfile> {
  solid:webid IRI
    // rdfs:label "profile webid"
    // :readonly true ;
  (   foaf:name xsd:string MinLength 2
    | foaf:givenName xsd:string ;
      foaf:familyName xsd:string
  )+ ;
  foaf:homepage IRI /^tel:+?[0-9.-]/ ? ;
  vc:hasAddress @<#vcard_street-address> * ;
  vc:organization-name xsd:string ?
    // rdfs:label "company" ;
  vc:someInt xsd:integer ;
} // rdfs:label "User Profile"

<#vcard_street-address> CLOSED {
  a [vc:StreetAddress vc:MailingAddress] ? ;
  vc:street-address xsd:string ? // rdfs:label "street" ;
  (   vc:locality xsd:string ? ;
    | vc:region xsd:string ?
  ) ;
  vc:country-name @<#vcard_country-name> ?
    // rdfs:label "country" ;
  vc:postal-code xsd:string ?
} // rdfs:label "Address"

<#vcard_country-name> [
  "Afghanistan"
  "Belgium"
  "CR"
  "France"
  "日本"
  "United Kingdom"
  "United States"
  "Zimbabwe"
]`
  }

  function defaultTurtle () {
    return `
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX vc: <http://www.w3.org/2006/vcard/ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX : <http://janeirodigital.com/layout#>
PREFIX solid: <http://www.w3.org/ns/solid/terms#>

<#me>
  solid:webid <#webid> ;
  foaf:name "Robert Smith" ;
  vc:telephone <tel:+33.6.80.80.00.00> ;
  vc:hasAddress [
    a vc:StreetAddress ;
    vc:locality "神奈川件" ;
    vc:country-name "日本" ;
    vc:postal-code "63000-8"
  ], [
    a vc:MailingAddress ;
    vc:region "CF" ;
    vc:country-name "France" ;
    vc:postal-code "63000"
  ] ;
  vc:organization-name "慶應義塾" ;
  vc:someInt 7 .`
  }
})()
