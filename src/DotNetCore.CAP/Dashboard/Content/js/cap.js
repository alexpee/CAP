(function (cap) {
    cap.config = {
        pollInterval: $("#capConfig").data("pollinterval"),
        pollUrl: $("#capConfig").data("pollurl"),
        locale: document.documentElement.lang
    };

    cap.Metrics = (function () {
        function Metrics() {
            this._metrics = {};
        }

        Metrics.prototype.addElement = function (name, element) {
            if (!(name in this._metrics)) {
                this._metrics[name] = [];
            }

            this._metrics[name].push(element);
        };

        Metrics.prototype.getElements = function (name) {
            if (!(name in this._metrics)) {
                return [];
            }

            return this._metrics[name];
        };

        Metrics.prototype.getNames = function () {
            var result = [];
            var metrics = this._metrics;

            for (var name in metrics) {
                if (metrics.hasOwnProperty(name)) {
                    result.push(name);
                }
            }

            return result;
        };

        return Metrics;
    })();

    var BaseGraph = function () {
        this.height = 200;
    };

    BaseGraph.prototype.update = function () {
        var graph = this._graph;

        var width = $(graph.element).innerWidth();
        if (width !== graph.width) {
            graph.configure({
                width: width,
                height: this.height
            });
        }

        graph.update();
    };

    BaseGraph.prototype._initGraph = function (element, settings, xSettings, ySettings) {

        var graph = this._graph = new Rickshaw.Graph($.extend({
            element: element,
            width: $(element).innerWidth(),
            height: this.height,
            interpolation: 'linear',
            stroke: true
        }, settings));

        this._hoverDetail = new Rickshaw.Graph.HoverDetail({
            graph: graph,
            yFormatter: function (y) { return Math.floor(y); },
            xFormatter: function (x) { return moment(new Date(x * 1000)).format("LLLL"); }
        });

        if (xSettings) {
            this._xAxis = new Rickshaw.Graph.Axis.Time($.extend({
                graph: graph,
                timeFixture: new Rickshaw.Fixtures.Time.Local()
            }, xSettings));

            var legend = new Rickshaw.Graph.Legend({
                element: document.querySelector('#legend'),
                graph: graph
            });
        }

        if (ySettings) {
            this._yAxis = new Rickshaw.Graph.Axis.Y($.extend({
                graph: graph,
                tickFormat: Rickshaw.Fixtures.Number.formatKMBT
            }, ySettings));
        }

        graph.render();
    }

    cap.RealtimeGraph = (function () {
        function RealtimeGraph(element,
            pubSucceeded, pubFailed, pubSucceededStr, pubFailedStr,
            recSucceeded, recFailed, recSucceededStr, recFailedStr
        ) {
            this._pubSucceeded = pubSucceeded;
            this._pubSucceededStr = pubSucceededStr;

            this._pubFailed = pubFailed;
            this._pubFailedStr = pubFailedStr;

            this._recSucceeded = recSucceeded;
            this._recSucceededStr = recSucceededStr;

            this._recFailed = recFailed;
            this._recFailedStr = recFailedStr;

            this._initGraph(element, {
                renderer: 'bar',
                series: new Rickshaw.Series.FixedDuration([
                    {
                        name: pubSucceededStr,
                        color: '#33cc33'
                    },{
                        name: recSucceededStr,
                        color: '#3333cc'
                    },{
                        name: pubFailedStr,
                        color: '#ff3300'
                    },{
                        name: recFailedStr,
                        color: '#ff3399'
                    }
                ],
                    undefined,
                    { timeInterval: 2000, maxDataPoints: 100 }
                )
            }, null, {});
        }

        RealtimeGraph.prototype = Object.create(BaseGraph.prototype);

        RealtimeGraph.prototype.appendHistory = function (statistics) {
            var newPubSucceeded = parseInt(statistics["published_succeeded:count"].intValue);
            var newPubFailed = parseInt(statistics["published_failed:count"].intValue);

            var newRecSucceeded = parseInt(statistics["received_succeeded:count"].intValue);
            var newRecFailed = parseInt(statistics["received_failed:count"].intValue);

            if (this._pubSucceeded !== null && this._pubFailed !== null &&
                this._recSucceeded !== null && this._recFailed !== null
            ) {
                var pubSucceeded = newPubSucceeded - this._pubSucceeded;
                var pubFailed = newPubFailed - this._pubFailed;

                var recSucceeded = newRecSucceeded - this._recSucceeded;
                var recFailed = newRecFailed - this._recFailed;

                var dataObj = {};
                dataObj[this._pubFailedStr] = pubFailed;
                dataObj[this._pubSucceededStr] = pubSucceeded;
                dataObj[this._recFailedStr] = recFailed;
                dataObj[this._recSucceededStr] = recSucceeded;

                this._graph.series.addData(dataObj);
                this._graph.render();
            }

            this._pubSucceeded = newPubSucceeded;
            this._pubFailed = newPubFailed;

            this._recSucceeded = newRecSucceeded;
            this._recFailed = newRecFailed;
        };

        return RealtimeGraph;
    })();

    cap.HistoryGraph = (function () {
        function HistoryGraph(element, pubSucceeded, pubFailed, pubSucceededStr, pubFailedStr,
            recSucceeded, recFailed, recSucceededStr, recFailedStr) {
            this._initGraph(element, {
                renderer: 'area',
                series: [
                   {
                        color: '#33cc33',
                        data: pubSucceeded,
                        name: pubSucceededStr
                    },{
                        color: '#3333cc',
                        data: recSucceeded,
                        name: recSucceededStr
                   },{
                       color: '#ff3300',
                       data: pubFailed,
                       name: pubFailedStr
                   }, {
                       color: '#ff3399',
                       data: recFailed,
                       name: recFailedStr
                   }
                ]
            }, {}, { ticksTreatment: 'glow' });
        }

        HistoryGraph.prototype = Object.create(BaseGraph.prototype);

        return HistoryGraph;
    })();

    cap.StatisticsPoller = (function () {
        function StatisticsPoller(metricsCallback, statisticsUrl, pollInterval) {
            this._metricsCallback = metricsCallback;
            this._listeners = [];
            this._statisticsUrl = statisticsUrl;
            this._pollInterval = pollInterval;
            this._intervalId = null;
        }

        StatisticsPoller.prototype.start = function () {
            var self = this;

            var intervalFunc = function () {
                try {
                    $.post(self._statisticsUrl, { metrics: self._metricsCallback() }, function (data) {
                        self._notifyListeners(data);
                    });
                } catch (e) {
                    console.log(e);
                }
            };

            this._intervalId = setInterval(intervalFunc, this._pollInterval);
        };

        StatisticsPoller.prototype.stop = function () {
            if (this._intervalId !== null) {
                clearInterval(this._intervalId);
                this._intervalId = null;
            }
        };

        StatisticsPoller.prototype.addListener = function (listener) {
            this._listeners.push(listener);
        };

        StatisticsPoller.prototype._notifyListeners = function (statistics) {
            var length = this._listeners.length;
            var i;

            for (i = 0; i < length; i++) {
                this._listeners[i](statistics);
            }
        };

        return StatisticsPoller;
    })();

    cap.Page = (function () {
        function Page(config) {
            this._metrics = new cap.Metrics();

            var self = this;
            this._poller = new cap.StatisticsPoller(
                function () { return self._metrics.getNames(); },
                config.pollUrl,
                config.pollInterval);

            this._initialize(config.locale);

            this.realtimeGraph = this._createRealtimeGraph('realtimeGraph');
            this.historyGraph = this._createHistoryGraph('historyGraph');

            this._poller.start();
        };

        Page.prototype._createRealtimeGraph = function (elementId) {
            var realtimeElement = document.getElementById(elementId);
            if (realtimeElement) {
                var pubSucceeded = parseInt($(realtimeElement).data('published-succeeded'));
                var pubFailed = parseInt($(realtimeElement).data('published-failed'));
                var pubSucceededStr = $(realtimeElement).data('published-succeeded-string');
                var pubFailedStr = $(realtimeElement).data('published-failed-string');

                var recSucceeded = parseInt($(realtimeElement).data('received-succeeded'));
                var recFailed = parseInt($(realtimeElement).data('received-failed'));
                var recSucceededStr = $(realtimeElement).data('received-succeeded-string');
                var recFailedStr = $(realtimeElement).data('received-failed-string');

                var realtimeGraph = new Cap.RealtimeGraph(realtimeElement,
                    pubSucceeded,
                    pubFailed,
                    pubSucceededStr,
                    pubFailedStr,
                    recSucceeded,
                    recFailed,
                    recSucceededStr,
                    recFailedStr
                );

                this._poller.addListener(function (data) {
                    realtimeGraph.appendHistory(data);
                });

                $(window).resize(function () {
                    realtimeGraph.update();
                });

                return realtimeGraph;
            }

            return null;
        };

        Page.prototype._createHistoryGraph = function (elementId) {
            var historyElement = document.getElementById(elementId);
            if (historyElement) {
                var createSeries = function (obj) {
                    var series = [];
                    for (var date in obj) {
                        if (obj.hasOwnProperty(date)) {
                            var value = obj[date];
                            var point = { x: Date.parse(date) / 1000, y: value };
                            series.unshift(point);
                        }
                    }
                    return series;
                };

                var publishedSucceeded = createSeries($(historyElement).data("published-succeeded"));
                var publishedFailed = createSeries($(historyElement).data("published-failed"));
                var publishedSucceededStr = $(historyElement).data('published-succeeded-string');
                var publishedFailedStr = $(historyElement).data('published-failed-string');

                var receivedSucceeded = createSeries($(historyElement).data("received-succeeded"));
                var receivedFailed = createSeries($(historyElement).data("received-failed"));
                var receivedSucceededStr = $(historyElement).data('received-succeeded-string');
                var receivedFailedStr = $(historyElement).data('received-failed-string');

                var historyGraph = new Cap.HistoryGraph(historyElement,
                    publishedSucceeded,
                    publishedFailed,
                    publishedSucceededStr,
                    publishedFailedStr,
                    receivedSucceeded,
                    receivedFailed,
                    receivedSucceededStr,
                    receivedFailedStr,
                );

                $(window).resize(function () {
                    historyGraph.update();
                });

                return historyGraph;
            }

            return null;
        };

        Page.prototype._initialize = function (locale) {
            moment.locale(locale);
            var updateRelativeDates = function () {
                $('*[data-moment]').each(function () {
                    var $this = $(this);
                    var timestamp = $this.data('moment');

                    if (timestamp) {
                        var time = moment(timestamp, 'X');
                        $this.html(time.fromNow())
                            .attr('title', time.format('llll'))
                            .attr('data-container', 'body');
                    }
                });

                $('*[data-moment-title]').each(function () {
                    var $this = $(this);
                    var timestamp = $this.data('moment-title');

                    if (timestamp) {
                        var time = moment(timestamp, 'X');
                        $this.prop('title', time.format('llll'))
                            .attr('data-container', 'body');
                    }
                });

                $('*[data-moment-local]').each(function () {
                    var $this = $(this);
                    var timestamp = $this.data('moment-local');

                    if (timestamp) {
                        var time = moment(timestamp, 'X');
                        $this.html(time.format('l LTS'));
                    }
                });
            };

            updateRelativeDates();
            setInterval(updateRelativeDates, 30 * 1000);

            $('*[title]').tooltip();

            var self = this;
            $('*[data-metric]').each(function () {
                var name = $(this).data('metric');
                self._metrics.addElement(name, this);
            });

            this._poller.addListener(function (metrics) {
                for (var name in metrics) {
                    var elements = self._metrics.getElements(name);
                    for (var i = 0; i < elements.length; i++) {
                        var metric = metrics[name];
                        var metricClass = metric ? "metric-" + metric.style : "metric-null";
                        var highlighted = metric && metric.highlighted ? "highlighted" : null;
                        var value = metric ? metric.value : null;

                        $(elements[i])
                            .text(value)
                            .closest('.metric')
                            .removeClass()
                            .addClass(["metric", metricClass, highlighted].join(' '));
                    }
                }
            });

            $(document).on('click', '*[data-ajax]', function (e) {
                var $this = $(this);
                var confirmText = $this.data('confirm');

                if (!confirmText || confirm(confirmText)) {
                    $this.prop('disabled');
                    var loadingDelay = setTimeout(function () {
                        $this.button('loading');
                    }, 100);

                    $.post($this.data('ajax'), function () {
                        clearTimeout(loadingDelay);
                        window.location.reload();
                    });
                }

                e.preventDefault();
            });

            $(document).on('click', '.expander', function (e) {
                var $expander = $(this),
                    $expandable = $expander.closest('tr').next().find('.expandable');

                if (!$expandable.is(':visible')) {
                    $expander.text('Less details...');
                }

                $expandable.slideToggle(
                    150,
                    function () {
                        if (!$expandable.is(':visible')) {
                            $expander.text('More details...');
                        }
                    });
                e.preventDefault();
            });

            $('.js-jobs-list').each(function () {
                var container = this;

                var selectRow = function (row, isSelected) {
                    var $checkbox = $('.js-jobs-list-checkbox', row);
                    if ($checkbox.length > 0) {
                        $checkbox.prop('checked', isSelected);
                        $(row).toggleClass('highlight', isSelected);
                    }
                };

                var toggleRowSelection = function (row) {
                    var $checkbox = $('.js-jobs-list-checkbox', row);
                    if ($checkbox.length > 0) {
                        var isSelected = $checkbox.is(':checked');
                        selectRow(row, !isSelected);
                    }
                };

                var setListState = function (state) {
                    $('.js-jobs-list-select-all', container)
                        .prop('checked', state === 'all-selected')
                        .prop('indeterminate', state === 'some-selected');

                    $('.js-jobs-list-command', container)
                        .prop('disabled', state === 'none-selected');
                };

                var updateListState = function () {
                    var selectedRows = $('.js-jobs-list-checkbox', container).map(function () {
                        return $(this).prop('checked');
                    }).get();

                    var state = 'none-selected';

                    if (selectedRows.length > 0) {
                        state = 'some-selected';

                        if ($.inArray(false, selectedRows) === -1) {
                            state = 'all-selected';
                        } else if ($.inArray(true, selectedRows) === -1) {
                            state = 'none-selected';
                        }
                    }

                    setListState(state);
                };

                $(this).on('click', '.js-jobs-list-checkbox', function (e) {
                    selectRow(
                        $(this).closest('.js-jobs-list-row').first(),
                        $(this).is(':checked'));

                    updateListState();

                    e.stopPropagation();
                });

                $(this).on('click', '.js-jobs-list-row', function (e) {
                    if ($(e.target).is('a')) return;

                    toggleRowSelection(this);
                    updateListState();
                });

                $(this).on('click', '.js-jobs-list-select-all', function () {
                    var selectRows = $(this).is(':checked');

                    $('.js-jobs-list-row', container).each(function () {
                        selectRow(this, selectRows);
                    });

                    updateListState();
                });

                $(this).on('click', '.js-jobs-list-command', function (e) {
                    var $this = $(this);
                    var confirmText = $this.data('confirm');

                    var jobs = $("input[name='messages[]']:checked", container).map(function () {
                        return $(this).val();
                    }).get();

                    if (!confirmText || confirm(confirmText)) {
                        $this.prop('disabled');
                        var loadingDelay = setTimeout(function () {
                            $this.button('loading');
                        }, 100);

                        $.post($this.data('url'), { 'messages[]': jobs }, function () {
                            clearTimeout(loadingDelay);
                            window.location.reload();
                        });
                    }

                    e.preventDefault();
                });

                updateListState();
            });
        };

        return Page;
    })();
})(window.Cap = window.Cap || {});

$(function () {
    Cap.page = new Cap.Page(Cap.config);
});

(function () {

    var json = null;

    $(".openModal").click(function () {
        var url = $(this).data("url");
        $.ajax({
            url: url,
            dataType: "json",
            success: function (data) {
                json = data;
                $("#formatBtn").click();
                $(".modal").modal("show");
            }
        });
    });

    $("#formatBtn").click(function () {
        $('#jsonContent').JSONView(json);
    });

    $("#rawBtn").click(function () {
        $('#jsonContent').text(JSON.stringify(json));
    });

    $("#expandBtn").click(function () {
        $('#jsonContent').JSONView('expand');
    });

    $("#collapseBtn").click(function () {
        $('#jsonContent').JSONView('collapse');
    });
})();