const ctx = {
    w: 800,
    h: 400,
    TRANSITION_DURATION: 1000,
    SRC_LOCAL: "LocalDump",
    SRC_OS: "OpenSky",
    scale: 1,
    currentFlights: [],
    planeUpdater: null
};

// const SRC = ctx.SRC_OS;
// local dump fallback if too many requests to online service
const SRC = ctx.SRC_LOCAL;
// iterate over:
// opensky_20221130T1349.json
// opensky_20221130T1350.json
// opensky_20221130T1351.json
// opensky_20221130T1352.json
// opensky_20221130T1353.json
const LOCAL_DUMP_TIME_INDICES = [...Array(5).keys()].map(i => i + 49);
let LOCAL_DUMP_TIME_INC = 1;

const PROJECTIONS = {
    ER: d3.geoEquirectangular().center([0, 0]).scale(128)
        .translate([ctx.w / 2, ctx.h / 2]),
};

const path4proj = d3.geoPath()
    .projection(PROJECTIONS.ER);


// 1
function createViz() {
    d3.select("body")
        .on("keydown", (event, d) => (handleKeyEvent(event)));
    let svgEl = d3.select("#main").append("svg");
    svgEl.attr("width", ctx.w);
    svgEl.attr("height", ctx.h);
    svgEl.append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("fill", "#bcd1f1");
    loadGeo(svgEl);

};


// 2
/* data fetching and transforming */
function loadGeo(svgEl) {
    let promises = [d3.json("ne_50m_admin_0_countries.geojson"),
    d3.json("ne_50m_lakes.geojson"),
    d3.json("ne_50m_rivers_lake_centerlines.geojson")];
    Promise.all(promises).then(function (data) {
        drawMap(data[0], data[1], data[2], svgEl);
        loadFlights();
    }).catch(function (error) { console.log(error) });
};


// 3.1
function drawMap(countries, lakes, rivers, svgEl) {
    ctx.mapG = svgEl.append("g")
        .attr("id", "map");
    // bind and draw geographical features to <path> elements
    let path4proj = d3.geoPath()
        .projection(PROJECTIONS.ER);
    let countryG = ctx.mapG.append("g").attr("id", "countries");
    countryG.selectAll("path.country")
        .data(countries.features)
        .enter()
        .append("path")
        .attr("d", path4proj)
        .attr("class", "country")
        .style("fill", "#EEE")
        // .on("click", function(event) {
        //     countryG.selectAll("path.country").style("fill", "#EEE");
        //     d3.select(this).style("fill", "lightgray");
        //     createBarchart();
        //   })
        ;



    let lakeG = ctx.mapG.append("g").attr("id", "lakes");
    lakeG.selectAll("path.lakes")
        .data(lakes.features)
        .enter()
        .append("path")
        .attr("d", path4proj)
        .attr("class", "lake");
    let riverG = ctx.mapG.append("g").attr("id", "rivers");
    riverG.selectAll("path.rivers")
        .data(rivers.features)
        .enter()
        .append("path")
        .attr("d", path4proj)
        .attr("class", "river");
    ctx.mapG.append("g")
        .attr("id", "planes");
    // pan & zoom
    function zoomed(event, d) {
        ctx.mapG.attr("transform", event.transform);
        let scale = ctx.mapG.attr("transform");
        scale = scale.substring(scale.indexOf('scale(') + 6);
        scale = parseFloat(scale.substring(0, scale.indexOf(')')));
        ctx.scale = 1 / scale;
        if (ctx.scale != 1) {
            d3.selectAll("image")
                .attr("transform", (d) => (getPlaneTransform(d)));
        }
    }
    let zoom = d3.zoom()
        .scaleExtent([1, 40])
        .on("zoom", zoomed);
    svgEl.call(zoom);
};


// 3.2
function loadFlights() {
    if (SRC == ctx.SRC_OS) {
        loadPlanesFromOpenSky();
    }
    else {
        loadPlanesFromLocalDump(`opensky_20221130T13${LOCAL_DUMP_TIME_INDICES[0]}.json`);
    }
    startPlaneUpdater();
}

// 4.1
function loadPlanesFromLocalDump(dumpPath) {
    console.log(`Querying local OpenSky dump ${dumpPath}...`);

    ctx.currentFlights = [];    // // remove the old
    d3.json(dumpPath).then(function (data) {

        data.states.forEach(function (d) {

            // remove null island
            if (d[5] == null & d[6] == null) { return; }

            let flight = {};
            flight["id"] = d[0];
            flight["callsign"] = d[1];
            flight["lon"] = d[5];
            flight["lat"] = d[6];
            flight["bearing"] = d[10];
            flight["alt"] = d[13];
            flight["onground"] = d[8];
            ctx.currentFlights.push(flight);
        })

        //console.log("---ctx.currentFlights---")
        console.log(ctx.currentFlights);
        drawFlights();
        createBarchart();
    })
};


function drawFlights() {

    let info = d3.select("#info")

    d3.select("#planes")
        .selectAll("image")
        .data(ctx.currentFlights, (d) => (d.id))
        .join(
            enter => (
                enter.append("image")
                    .attr("transform", d => getPlaneTransform(d))
                    .attr("width", 8)
                    .attr("height", 8)
                    .attr("xlink:href", " plane_icon.png")
                    .on("mouseover", function (event, d) {
                        // console.log(d.callsign);
                        info.text(d.callsign)
                    })
            ),
            update => (
                update
                .transition()
                .duration(1000)
                .attr("transform", d => getPlaneTransform(d))
            ),
            exit => (
                exit.remove()
            )
        );
}


function getPlaneTransform(d) {
    let xy = PROJECTIONS.ER([d.lon, d.lat]);
    let sc = 4 * ctx.scale;
    let x = xy[0] - sc;
    let y = xy[1] - sc;
    if (d.bearing != null && d.bearing != 0) {
        let t = `translate(${x},${y}) rotate(${d.bearing} ${sc} ${sc})`;
        return (ctx.scale == 1) ? t : t + ` scale(${ctx.scale})`;
    }
    else {
        let t = `translate(${x},${y})`;
        return (ctx.scale == 1) ? t : t + ` scale(${ctx.scale})`;
    }
};


// 4.2
function loadPlanesFromOpenSky() {
    console.log("Querying OpenSky...");
    // ...
};

function toggleUpdate() {
    // feel free to rewrite the 'if' test
    // this is just dummy code to make the interface
    // behave properly

    if (d3.select("#updateBt").attr("value") == "On") {
        d3.select("#updateBt").attr("value", "Off");
        // ...
        clearInterval(ctx.planeUpdater);

    }
    else {
        d3.select("#updateBt").attr("value", "On");
        // ...
        startPlaneUpdater();
    }
};


function startPlaneUpdater() {

    // call function() every 10 seconds
    ctx.planeUpdater = setInterval(
        function () {
            if (SRC == ctx.SRC_OS) {
                loadPlanesFromOpenSky();
            }
            else {
                loadPlanesFromLocalDump(`opensky_20221130T13${LOCAL_DUMP_TIME_INDICES[LOCAL_DUMP_TIME_INC]}.json`);
                if (LOCAL_DUMP_TIME_INC == LOCAL_DUMP_TIME_INDICES.length - 1) {
                    LOCAL_DUMP_TIME_INC = 0;
                }
                else {
                    LOCAL_DUMP_TIME_INC++;
                }

            }
        },
        10000);
};


// Extension
var createBarchart = function () {
    vlSpec1 = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "data": {
            "values": ctx.currentFlights,
        },
        "mark": "bar",
        "encoding": {
            "x": {
                "field": "alt",
                "bin": { "maxbins": 45 },
                "type": "quantitative",
                "title": "altitude (m)",
            },
            "y": {
                "aggregate": "count",
                "field": "alt",
                "type": "quantitative",
                "title": "count",
            },
        },
    }
    vlOpts1 = { width: 300, height: 300, actions: false };
    vegaEmbed("#vega1", vlSpec1, vlOpts1);

    vlSpec2 = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "data": {
            "values": ctx.currentFlights,
        },
        "mark": "bar",
        "encoding": {
            "x": {
                "aggregate": "count",
                "field": "onground",
                "type": "quantitative",
                "title": "count",
            },
            "color": {
                "field": "onground",
                "type": "nominal",
                "title": "On Ground"
            },
        },

    }
    vlOpts2 = { width: 300, height: 20, actions: false };
    vegaEmbed("#vega2", vlSpec2, vlOpts2);
};