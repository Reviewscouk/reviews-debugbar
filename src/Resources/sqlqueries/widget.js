(function ($) {

    var csscls = PhpDebugBar.utils.makecsscls('phpdebugbar-widgets-');

    /**
     * Widget for the displaying sql queries
     *
     * Options:
     *  - data
     */
    var LaravelSQLQueriesWidget = PhpDebugBar.Widgets.LaravelSQLQueriesWidget = PhpDebugBar.Widget.extend({

        className: csscls('sqlqueries'),

        onFilterClick: function (el) {
            $(el).toggleClass(csscls('excluded'));

            var excludedLabels = [];
            this.$toolbar.find(csscls('.filter') + csscls('.excluded')).each(function () {
                excludedLabels.push(this.rel);
            });

            this.$list.$el.find("li[connection=" + $(el).attr("rel") + "]").toggle();

            this.set('exclude', excludedLabels);
        },

        onCopyToClipboard: function (el) {
            var code = $(el).parent('li').find('code').get(0);
            var copy = function () {
                try {
                    document.execCommand('copy');
                    alert('Query copied to the clipboard');
                } catch (err) {
                    console.log('Oops, unable to copy');
                }
            };
            var select = function (node) {
                if (document.selection) {
                    var range = document.body.createTextRange();
                    range.moveToElementText(node);
                    range.select();
                } else if (window.getSelection) {
                    var range = document.createRange();
                    range.selectNodeContents(node);
                    window.getSelection().removeAllRanges();
                    window.getSelection().addRange(range);
                }
                copy();
                window.getSelection().removeAllRanges();
            };
            select(code);
        },

        onDebugClick: function (el) {
            var li = $(el).parent('li');
            var stmt = li.data('stmt');
            var sqlCode = li.find('code').html();
            var self = this;
            
            
            
            // Create modal
            var modal = $('<div />')
                .addClass(csscls('debug-modal'))
                .css({
                    'position': 'fixed',
                    'top': '0',
                    'left': '0',
                    'width': '100%',
                    'height': '100%',
                    'background-color': 'rgba(0, 0, 0, 0.5)',
                    'z-index': '999999999',
                    'display': 'flex',
                    'justify-content': 'center'
                });

            var modalContent = $('<div />')
                .addClass(csscls('debug-modal-content'))
                .css({
                    'background-color': '#fff',
                    'border-radius': '8px',
                    'padding': '20px',
                    'max-width': '80%',
                    'max-height': '80%',
                    'overflow': 'auto',
                    'position': 'relative',
                    'box-shadow': '0 4px 6px rgba(0, 0, 0, 0.1)',
                    'margin-top': '100px'
                });

            var closeBtn = $('<button />')
                .text('×')
                .css({
                    'position': 'absolute',
                    'top': '10px',
                    'right': '15px',
                    'background': 'none',
                    'border': 'none',
                    'font-size': '24px',
                    'cursor': 'pointer',
                    'color': '#666'
                })
                .on('click', function() {
                    modal.remove();
                });

            var title = $('<h3 />')
                .text('SQL Query')
                .css({
                    'margin-top': '0',
                    'margin-bottom': '20px',
                    'color': '#333',
                    'font-size': '24px',
                    'font-weight': '600'
                });

            var content = $('<div />');

            // SQL Query
            if (sqlCode) {
                content.append(
                    $('<div />')
                        .addClass(csscls('sql-debug'))
                        .html(sqlCode)
                        .css({
                            'background-color': '#f5f5f5',
                            'padding': '15px',
                            'border-radius': '4px',
                            'font-family': 'monospace',
                            'white-space': 'pre-wrap',
                            'margin-bottom': '20px'
                        })
                );
            }

            // Statement data
            if (stmt) {
                var stmtInfo = $('<div />');
                
                if (stmt.duration_str) {
                    stmtInfo.append(
                        $('<p />').html('<strong>Duration:</strong> ' + stmt.duration_str)
                    );
                }
                
                if (stmt.memory_str) {
                    stmtInfo.append(
                        $('<p />').html('<strong>Memory Usage:</strong> ' + stmt.memory_str)
                    );
                }
                
                if (typeof(stmt.row_count) != 'undefined') {
                    stmtInfo.append(
                        $('<p />').html('<strong>Row Count:</strong> ' + stmt.row_count)
                    );
                } 
                
                content.append(stmtInfo);
            }

            // Add analysis section
            var analysisSection = $('<div />')
                .addClass(csscls('analysis-section'))
                .css({
                    'margin-top': '20px',
                    'border-top': '1px solid #eee',
                    'padding-top': '20px'
                });


    

            var loadingIndicator = $('<div />')
                .html('Analyzing Query')
                .css({
                    'color': '#666',
                    'font-style': 'italic',
                    'text-align': 'center',
                    'padding': '20px'
                });

            var analysisResults = $('<div />')
                .addClass(csscls('analysis-results'))
                .css('margin-top', '10px');

            analysisSection.append(loadingIndicator, analysisResults);
            content.append(analysisSection);

            modalContent.append(closeBtn, title, content);
            modal.append(modalContent);
            
            // Close modal when clicking outside
            modal.on('click', function(e) {
                if (e.target === modal[0]) {
                    modal.remove();
                }
            });
            
            // Close modal with Escape key
            $(document).on('keydown.debug-modal', function(e) {
                if (e.keyCode === 27) { // Escape key
                    modal.remove();
                    $(document).off('keydown.debug-modal');
                }
            });
            
            $('body').append(modal);

            // Make backend calls for query analysis
            if (stmt && stmt.sql) {
                self.performQueryAnalysis(stmt, analysisResults, loadingIndicator);
            }
        },

        performQueryAnalysis: function(stmt, resultsContainer, loadingIndicator) {
            var self = this;
            
            // Make AJAX call to backend analysis endpoint
            $.ajax({
                url: '/_debugbar/analyze-query',
                method: 'POST',
                data: JSON.stringify({ sql: stmt.sql }),
                contentType: 'application/json',
                dataType: 'json',
                success: function(response) {
                    loadingIndicator.hide();
                    self.displayOpenAIAnalysis(response, resultsContainer);
                },
                error: function(xhr, status, error) {
                    loadingIndicator.hide();
                    self.displayAnalysisError(error, resultsContainer);
                }
            });
        },

        displayOpenAIAnalysis: function(response, container) {
            container.empty();
            
            if (response.success && response.analysis) {
                try {
                    // Parse the JSON response
                    var analysisData = JSON.parse(response.analysis);
                    console.log(analysisData);
                    
                    // Helper function to create appropriate text element
                    var createTextElement = function(text, isCodeExample) {
                        // Convert escaped newlines to actual newlines
                        var processedText = text.replace(/\\n/g, '\n');
                        
                        // Only render as code if it's from code_examples property
                        if (isCodeExample && isCode(processedText)) {
                            return $('<pre />')
                                .text(processedText)
                                .css({
                                    'background-color': '#2d3748',
                                    'color': '#e2e8f0',
                                    'padding': '15px',
                                    'border-radius': '6px',
                                    'font-family': 'Monaco, Menlo, "Ubuntu Mono", monospace',
                                    'font-size': '13px',
                                    'overflow-x': 'auto',
                                    'margin': '0',
                                    'border': '1px solid #4a5568'
                                });
                        } else {
                            return $('<p />')
                                .html(processedText.replace(/\n/g, '<br>'))
                                .css({
                                    'line-height': '1.6',
                                    'font-size': '14px',
                                    'color': '#4a5568',
                                    'margin': '0 0 10px 0'
                                });
                        }
                    };
                    
                    // Helper function to detect if text is code
                    var isCode = function(text) {
                        return text.includes('<?php') || text.includes('->') ;
                    };

                    // Create main educational container
                    var educationalContainer = $('<div />')
                        .addClass(csscls('educational-analysis'))
                        .css({
                            'margin-bottom': '20px'
                        });

                    // Helper function to create educational sections
                    var createEducationalSection = function(title, content, icon, color, isCodeExample) {
                        var section = $('<div />')
                            .addClass(csscls('educational-section'))
                            .css({
                                'margin-bottom': '25px',
                                'padding': '20px',
                                'background-color': color || '#f8f9fa',
                                'border-radius': '8px',
                                'border-left': '4px solid #007bff',
                                'box-shadow': '0 2px 4px rgba(0,0,0,0.1)'
                            });

                        var sectionHeader = $('<div />')
                            .css({
                                'display': 'flex',
                                'align-items': 'center',
                                'margin-bottom': '15px'
                            });

                        var iconElement = $('<span />')
                            .html(icon || '📚')
                            .css({
                                'font-size': '20px',
                                'margin-right': '10px'
                            });

                        var titleElement = $('<h5 />')
                            .text(title)
                            .css({
                                'margin': '0',
                                'color': '#333',
                                'font-weight': '600',
                                'font-size': '16px'
                            });

                        sectionHeader.append(iconElement, titleElement);
                        section.append(sectionHeader);

                        // Handle different content types
                        if (Array.isArray(content)) {
                            var list = $('<ul />').css({
                                'margin': '0',
                                'padding-left': '20px'
                            });
                            content.forEach(function(item) {
                                var listItem = $('<li />').css({
                                    'margin-bottom': '8px',
                                    'line-height': '1.5'
                                });
                                
                                if (typeof item === 'string') {
                                    listItem.append(createTextElement(item, isCodeExample));
                                } else {
                                    listItem.text(JSON.stringify(item));
                                }
                                
                                list.append(listItem);
                            });
                            section.append(list);
                        } else if (typeof content === 'object' && content !== null) {
                            // Handle nested object content
                            Object.keys(content).forEach(function(key) {
                                var value = content[key];
                                var subsection = $('<div />').css('margin-bottom', '15px');
                                
                                // Format the key as a heading
                                var heading = key.replace(/_/g, ' ').replace(/\b\w/g, function(l) {
                                    return l.toUpperCase();
                                });
                                
                                subsection.append(
                                    $('<h6 />').text(heading).css({
                                        'margin-bottom': '8px',
                                        'color': '#495057',
                                        'font-size': '14px',
                                        'font-weight': '600'
                                    })
                                );
                                
                                // Special handling for explain_plan array
                                if (key === 'explain_plan' && Array.isArray(value)) {
                                    var table = $('<table />').css({
                                        'width': '100%',
                                        'border-collapse': 'collapse',
                                        'margin-top': '10px',
                                        'font-size': '12px'
                                    });
                                    
                                    // Create header row
                                    var headerRow = $('<tr />');
                                    var headers = ['Table', 'Type', 'Key', 'Rows', 'Filtered', 'Extra'];
                                    headers.forEach(function(header) {
                                        headerRow.append(
                                            $('<th />')
                                                .text(header)
                                                .css({
                                                    'border': '1px solid #dee2e6',
                                                    'padding': '8px',
                                                    'background-color': '#f8f9fa',
                                                    'font-weight': '600',
                                                    'text-align': 'left'
                                                })
                                        );
                                    });
                                    table.append(headerRow);
                                    
                                    // Create data rows
                                    value.forEach(function(row) {
                                        var dataRow = $('<tr />');
                                        var fields = ['table', 'type', 'key', 'rows', 'filtered', 'Extra'];
                                        fields.forEach(function(field) {
                                            var cellValue = row[field] || '';
                                            dataRow.append(
                                                $('<td />')
                                                    .text(cellValue)
                                                    .css({
                                                        'border': '1px solid #dee2e6',
                                                        'padding': '8px',
                                                        'background-color': field === 'type' && cellValue === 'ALL' ? '#fff3cd' : 
                                                                         field === 'type' && cellValue === 'range' ? '#d4edda' : '#fff'
                                                    })
                                            );
                                        });
                                        table.append(dataRow);
                                    });
                                    
                                    subsection.append(table);
                                } else if (Array.isArray(value)) {
                                    var nestedList = $('<ul />').css({
                                        'margin': '0',
                                        'padding-left': '20px'
                                    });
                                    value.forEach(function(item) {
                                        if (typeof item === 'object' && item !== null) {
                                            // Handle nested objects in arrays
                                            var nestedItem = $('<li />').css('margin-bottom', '8px');
                                            Object.keys(item).forEach(function(nestedKey) {
                                                var nestedValue = item[nestedKey];
                                                nestedItem.append(
                                                    $('<strong />').text(nestedKey.replace(/_/g, ' ') + ': ').css('color', '#495057'),
                                                    $('<span />').text(nestedValue).css('color', '#6c757d')
                                                );
                                                nestedItem.append($('<br />'));
                                            });
                                            nestedList.append(nestedItem);
                                        } else {
                                            nestedList.append(
                                                $('<li />')
                                                    .text(item)
                                                    .css({
                                                        'margin-bottom': '8px',
                                                        'line-height': '1.5'
                                                    })
                                            );
                                        }
                                    });
                                    subsection.append(nestedList);
                                } else if (typeof value === 'object' && value !== null) {
                                    // Handle nested objects
                                    Object.keys(value).forEach(function(nestedKey) {
                                        var nestedValue = value[nestedKey];
                                        var nestedDiv = $('<div />').css('margin-bottom', '8px');
                                        
                                        nestedDiv.append(
                                            $('<strong />').text(nestedKey.replace(/_/g, ' ') + ': ').css('color', '#495057')
                                        );
                                        
                                        if (typeof nestedValue === 'string') {
                                            // Check if it looks like code
                                            if (isCode(nestedValue)) {
                                                nestedDiv.append(
                                                    $('<span />')
                                                        .text(nestedValue)
                                                        .css({
                                                            'background-color': '#2d3748',
                                                            'color': '#e2e8f0',
                                                            'padding': '10px',
                                                            'border-radius': '4px',
                                                            'font-family': 'Monaco, Menlo, "Ubuntu Mono", monospace',
                                                            'font-size': '12px',
                                                            'overflow-x': 'auto',
                                                            'margin': '5px 0 0 0',
                                                            'border': '1px solid #4a5568'
                                                        })
                                                );
                                            } else {
                                                nestedDiv.append(createTextElement(nestedValue, isCodeExample));
                                            }
                                        } else {
                                            nestedDiv.append(createTextElement(JSON.stringify(nestedValue), isCodeExample));
                                        }
                                        
                                        subsection.append(nestedDiv);
                                    });
                                } else if (typeof value === 'string') {
                                    // Check if it looks like code
                                    if (isCode(value)) {
                                        subsection.append(
                                            $('<pre />')
                                                .text(value)
                                                .css({
                                                    'background-color': '#2d3748',
                                                    'color': '#e2e8f0',
                                                    'padding': '15px',
                                                    'border-radius': '6px',
                                                    'font-family': 'Monaco, Menlo, "Ubuntu Mono", monospace',
                                                    'font-size': '13px',
                                                    'overflow-x': 'auto',
                                                    'margin': '0',
                                                    'border': '1px solid #4a5568'
                                                })
                                        );
                                    } else {
                                        subsection.append(createTextElement(value, isCodeExample));
                                    }
                                } else {
                                    subsection.append(createTextElement(JSON.stringify(value), isCodeExample));
                                }
                                
                                section.append(subsection);
                            });
                        } else if (typeof content === 'string') {
                            // Check if it looks like code
                            if (isCode(content)) {
                                // Code content
                                section.append(
                                    $('<pre />').text(content)
                                        
                                );
                            } else {
                                // Regular text
                                section.append(createTextElement(content, isCodeExample));
                            }
                        }

                        return section;
                    };

                    // Process each section of the educational content in the specified order
                    var sectionConfigs = [
                        {
                            key: 'query_explanation',
                            title: 'What This Query Does',
                            icon: '🔍',
                            color: '#e6f3ff'
                        },
                        {
                            key: 'explain_plan_analysis',
                            title: 'EXPLAIN Plan Analysis',
                            icon: '📊',
                            color: '#f3e5f5'
                        },
                        {
                            key: 'performance_lessons',
                            title: 'Key Performance Lessons',
                            icon: '⚡',
                            color: '#d4edda'
                        },
                        {
                            key: 'improvement_steps',
                            title: 'Step-by-Step Improvements',
                            icon: '📈',
                            color: '#d1ecf1'
                        },
                        {
                            key: 'code_examples',
                            title: 'Try This Code',
                            icon: '💻',
                            color: '#e2e3e5',
                            isCodeExample: true
                        },
                        {
                            key: 'common_mistakes',
                            title: 'Common Mistakes to Avoid',
                            icon: '⚠️',
                            color: '#f8d7da'
                        },
                        {
                            key: 'learning_resources',
                            title: 'Further Learning',
                            icon: '📖',
                            color: '#fff3e0'
                        },
                        {
                            key: 'learning_progression',
                            title: 'What to Learn Next',
                            icon: '🎯',
                            color: '#e1f5fe'
                        }
                    ];

                    // Add sections that have content
                    sectionConfigs.forEach(function(config) {
                        var content = analysisData[config.key];
                        var hasContent = false;
                        
                        if (content) {
                            if (Array.isArray(content)) {
                                hasContent = content.length > 0;
                            } else if (typeof content === 'string') {
                                hasContent = content.trim() !== '';
                            } else if (typeof content === 'object') {
                                hasContent = Object.keys(content).length > 0;
                            } else {
                                hasContent = true; // For numbers, booleans, etc.
                            }
                        }
                        
                        if (hasContent) {
                            educationalContainer.append(
                                createEducationalSection(
                                    config.title,
                                    content,
                                    config.icon,
                                    config.color,
                                    config.isCodeExample
                                )
                            );
                        }
                    });

                    // Add a motivational footer
                    var footer = $('<div />')
                        .addClass(csscls('educational-footer'))
                        .css({
                            'text-align': 'center',
                            'margin-top': '30px',
                            'padding': '20px',
                            'background-color': '#f8f9fa',
                            'border-radius': '8px',
                            'border': '1px solid #dee2e6'
                        });


                    educationalContainer.append(footer);
                    container.append(educationalContainer);
                    
                } catch (e) {
                    // Fallback to plain text if JSON parsing fails
                    console.error('JSON parsing error:', e);
                    console.log('Raw response:', response.analysis);
                    
                    var fallbackSection = createEducationalSection(
                        'AI Analysis',
                        'There was an issue parsing the AI response. Here\'s what we received:\n\n' + response.analysis,
                        '🤖',
                        '#f8f9fa',
                        false
                    );
                    container.append(fallbackSection);
                }
            } else if (response.error) {
                container.append(
                    $('<div />')
                        .text('Analysis Error: ' + response.error)
                        .css({
                            'color': '#dc3545',
                            'padding': '15px',
                            'background-color': '#f8d7da',
                            'border-radius': '6px',
                            'border': '1px solid #f5c6cb',
                            'text-align': 'center'
                        })
                );
            }
        },

        displayAnalysisError: function(error, container) {
            container.empty().append(
                $('<div />')
                    .text('Error analyzing query: ' + error)
                    .css({
                        'color': '#dc3545',
                        'padding': '10px',
                        'background-color': '#f8d7da',
                        'border-radius': '4px',
                        'border': '1px solid #f5c6cb'
                    })
            );
        },



        extractTableNames: function(sql) {
            if (!sql || typeof sql !== 'string') {
                return [];
            }

            var tables = [];
            var sqlUpper = sql.toUpperCase();
            
            // Remove comments
            sql = sql.replace(/--.*$/gm, ''); // Single line comments
            sql = sql.replace(/\/\*[\s\S]*?\*\//g, ''); // Multi-line comments
            
            // Remove string literals to avoid false positives
            sql = sql.replace(/'(?:[^'\\]|\\.)*'/g, ''); // Single quotes
            sql = sql.replace(/"(?:[^"\\]|\\.)*"/g, ''); // Double quotes
            sql = sql.replace(/`(?:[^`\\]|\\.)*`/g, ''); // Backticks
            
            // Common SQL patterns for table names
            var patterns = [
                // FROM clause
                /\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*\s*(?:AS\s+[a-zA-Z_][a-zA-Z0-9_]*)?)/gi,
                /\bFROM\s+`([^`]+)`/gi,
                /\bFROM\s+"([^"]+)"/gi,
                /\bFROM\s+\[([^\]]+)\]/gi,
                
                // JOIN clauses
                /\bJOIN\s+([a-zA-Z_][a-zA-Z0-9_]*\s*(?:AS\s+[a-zA-Z_][a-zA-Z0-9_]*)?)/gi,
                /\bJOIN\s+`([^`]+)`/gi,
                /\bJOIN\s+"([^"]+)"/gi,
                /\bJOIN\s+\[([^\]]+)\]/gi,
                
                // LEFT/RIGHT/INNER/OUTER JOIN
                /\b(?:LEFT|RIGHT|INNER|OUTER|CROSS|NATURAL)\s+JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*\s*(?:AS\s+[a-zA-Z_][a-zA-Z0-9_]*)?)/gi,
                /\b(?:LEFT|RIGHT|INNER|OUTER|CROSS|NATURAL)\s+JOIN\s+`([^`]+)`/gi,
                /\b(?:LEFT|RIGHT|INNER|OUTER|CROSS|NATURAL)\s+JOIN\s+"([^"]+)"/gi,
                /\b(?:LEFT|RIGHT|INNER|OUTER|CROSS|NATURAL)\s+JOIN\s+\[([^\]]+)\]/gi,
                
                // INSERT INTO
                /\bINSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
                /\bINSERT\s+INTO\s+`([^`]+)`/gi,
                /\bINSERT\s+INTO\s+"([^"]+)"/gi,
                /\bINSERT\s+INTO\s+\[([^\]]+)\]/gi,
                
                // UPDATE
                /\bUPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
                /\bUPDATE\s+`([^`]+)`/gi,
                /\bUPDATE\s+"([^"]+)"/gi,
                /\bUPDATE\s+\[([^\]]+)\]/gi,
                
                // DELETE FROM
                /\bDELETE\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
                /\bDELETE\s+FROM\s+`([^`]+)`/gi,
                /\bDELETE\s+FROM\s+"([^"]+)"/gi,
                /\bDELETE\s+FROM\s+\[([^\]]+)\]/gi,
                
                // CREATE TABLE
                /\bCREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi,
                /\bCREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`/gi,
                /\bCREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"([^"]+)"/gi,
                /\bCREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?\[([^\]]+)\]/gi,
                
                // DROP TABLE
                /\bDROP\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi,
                /\bDROP\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+EXISTS\s+)?`([^`]+)`/gi,
                /\bDROP\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/gi,
                /\bDROP\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+EXISTS\s+)?\[([^\]]+)\]/gi,
                
                // ALTER TABLE
                /\bALTER\s+TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
                /\bALTER\s+TABLE\s+`([^`]+)`/gi,
                /\bALTER\s+TABLE\s+"([^"]+)"/gi,
                /\bALTER\s+TABLE\s+\[([^\]]+)\]/gi,
                
                // TRUNCATE TABLE
                /\bTRUNCATE\s+(?:TABLE\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi,
                /\bTRUNCATE\s+(?:TABLE\s+)?`([^`]+)`/gi,
                /\bTRUNCATE\s+(?:TABLE\s+)?"([^"]+)"/gi,
                /\bTRUNCATE\s+(?:TABLE\s+)?\[([^\]]+)\]/gi,
                
                // INTO clause (for SELECT INTO)
                /\bINTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
                /\bINTO\s+`([^`]+)`/gi,
                /\bINTO\s+"([^"]+)"/gi,
                /\bINTO\s+\[([^\]]+)\]/gi
            ];

            patterns.forEach(function(pattern) {
                var matches = sql.match(pattern);
                if (matches) {
                    matches.forEach(function(match, index) {
                        if (index > 0) { // Skip the full match, get capture groups
                            var tableName = match.trim();
                            
                            // Remove AS alias if present
                            tableName = tableName.replace(/\s+AS\s+[a-zA-Z_][a-zA-Z0-9_]*$/i, '');
                            tableName = tableName.replace(/\s+[a-zA-Z_][a-zA-Z0-9_]*$/i, '');
                            
                            // Clean up the table name
                            tableName = tableName.replace(/^[`"\[\]]+|[`"\[\]]+$/g, ''); // Remove quotes/brackets
                            
                            if (tableName && tableName.length > 0 && !tables.includes(tableName)) {
                                tables.push(tableName);
                            }
                        }
                    });
                }
            });

            // Handle subqueries and CTEs (Common Table Expressions)
            var ctePattern = /\bWITH\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/gi;
            var cteMatches = sql.match(ctePattern);
            if (cteMatches) {
                cteMatches.forEach(function(match) {
                    var cteName = match.replace(/\bWITH\s+/i, '').replace(/\s+AS\s*\(/i, '').trim();
                    if (cteName && !tables.includes(cteName)) {
                        tables.push(cteName);
                    }
                });
            }

            return tables;
        },

        getTableAnalysis: function(sql) {
            var tables = this.extractTableNames(sql);
            var analysis = {
                tables: tables,
                table_count: tables.length,
                has_subqueries: sql.toUpperCase().includes('SELECT') && (sql.match(/\(/g) || []).length > (sql.match(/\)/g) || []).length,
                has_ctes: /WITH\s+[a-zA-Z_][a-zA-Z0-9_]*\s+AS/i.test(sql),
                query_type: this.getQueryType(sql)
            };
            
            return analysis;
        },

        getQueryType: function(sql) {
            var sqlUpper = sql.toUpperCase().trim();
            
            if (sqlUpper.startsWith('SELECT')) return 'SELECT';
            if (sqlUpper.startsWith('INSERT')) return 'INSERT';
            if (sqlUpper.startsWith('UPDATE')) return 'UPDATE';
            if (sqlUpper.startsWith('DELETE')) return 'DELETE';
            if (sqlUpper.startsWith('CREATE TABLE')) return 'CREATE TABLE';
            if (sqlUpper.startsWith('DROP TABLE')) return 'DROP TABLE';
            if (sqlUpper.startsWith('ALTER TABLE')) return 'ALTER TABLE';
            if (sqlUpper.startsWith('TRUNCATE')) return 'TRUNCATE';
            if (sqlUpper.startsWith('WITH')) return 'CTE';
            
            return 'UNKNOWN';
        },

        render: function () {
            this.$status = $('<div />').addClass(csscls('status')).appendTo(this.$el);

            this.$toolbar = $('<div></div>').addClass(csscls('toolbar')).appendTo(this.$el);

            var filters = [], self = this;

            this.$list = new PhpDebugBar.Widgets.ListWidget({ itemRenderer: function (li, stmt) {
                // Store statement data in the list item for modal access
                li.data('stmt', stmt);
                if (stmt.type === 'transaction') {
                    $('<strong />').addClass(csscls('sql')).addClass(csscls('name')).text(stmt.sql).appendTo(li);
                } else {
                    $('<code />').addClass(csscls('sql')).html(PhpDebugBar.Widgets.highlight(stmt.sql, 'sql')).appendTo(li);
                }
                if (stmt.width_percent) {
                    $('<div></div>').addClass(csscls('bg-measure')).append(
                        $('<div></div>').addClass(csscls('value')).css({
                            left: stmt.start_percent + '%',
                            width: Math.max(stmt.width_percent, 0.01) + '%',
                        })
                    ).appendTo(li);
                }
                if (stmt.duration_str) {
                    $('<span title="Duration" />').addClass(csscls('duration')).text(stmt.duration_str).appendTo(li);
                }
                if (stmt.memory_str) {
                    $('<span title="Memory usage" />').addClass(csscls('memory')).text(stmt.memory_str).appendTo(li);
                }
                if (typeof(stmt.row_count) != 'undefined') {
                    $('<span title="Row count" />').addClass(csscls('row-count')).text(stmt.row_count).appendTo(li);
                }
                if (typeof(stmt.stmt_id) != 'undefined' && stmt.stmt_id) {
                    $('<span title="Prepared statement ID" />').addClass(csscls('stmt-id')).text(stmt.stmt_id).appendTo(li);
                }
                if (stmt.connection) {
                    $('<span title="Connection" />').addClass(csscls('database')).text(stmt.connection).appendTo(li);
                    li.attr("connection",stmt.connection);
                    if ( $.inArray(stmt.connection, filters) == -1 ) {
                        filters.push(stmt.connection);
                        $('<a />')
                            .addClass(csscls('filter'))
                            .text(stmt.connection)
                            .attr('rel', stmt.connection)
                            .on('click', function () {
                                self.onFilterClick(this); })
                            .appendTo(self.$toolbar);
                        if (filters.length > 1) {
                            self.$toolbar.show();
                            self.$list.$el.css("margin-bottom","20px");
                        }
                    }
                }
                if (typeof(stmt.is_success) != 'undefined' && !stmt.is_success) {
                    li.addClass(csscls('error'));
                    li.append($('<span />').addClass(csscls('error')).text("[" + stmt.error_code + "] " + stmt.error_message));
                }


                $('<span title="Debug" style="border:1px solid #fff;border-radius:5px;padding:5px;background-color:#fff;color:#000;cursor:pointer;">Analyze</span>')
                        .addClass(csscls('debug'))
                        .css('cursor', 'pointer')
                        .on('click', function (event) {
                            self.onDebugClick(this);
                            event.stopPropagation();
                        })
                        .appendTo(li);

                if (stmt.show_copy) {
                    $('<span title="Copy to clipboard" />')
                        .addClass(csscls('copy-clipboard'))
                        .css('cursor', 'pointer')
                        .on('click', function (event) {
                            self.onCopyToClipboard(this);
                            event.stopPropagation();
                        })
                        .appendTo(li);
                }

                var table = $('<table><tr><th colspan="2">Metadata</th></tr></table>').addClass(csscls('params')).appendTo(li);

                if (stmt.bindings && stmt.bindings.length) {
                    table.append(function () {
                        var icon = 'thumb-tack';
                        var $icon = '<i class="phpdebugbar-fa phpdebugbar-fa-' + icon + ' phpdebugbar-text-muted"></i>';
                        var $name = $('<td />').addClass(csscls('name')).html('Bindings ' + $icon);
                        var $value = $('<td />').addClass(csscls('value'));
                        var $span = $('<span />').addClass('phpdebugbar-text-muted');

                        var index = 0;
                        var $bindings = new PhpDebugBar.Widgets.ListWidget({ itemRenderer: function (li, binding) {
                            var $index = $span.clone().text(index++ + '.');
                            li.append($index, '&nbsp;', binding).removeClass(csscls('list-item')).addClass(csscls('table-list-item'));
                        }});

                        $bindings.set('data', stmt.bindings);

                        $bindings.$el
                            .removeClass(csscls('list'))
                            .addClass(csscls('table-list'))
                            .appendTo($value);

                        return $('<tr />').append($name, $value);
                    });
                }

                if (stmt.hints && stmt.hints.length) {
                    table.append(function () {
                        var icon = 'question-circle';
                        var $icon = '<i class="phpdebugbar-fa phpdebugbar-fa-' + icon + ' phpdebugbar-text-muted"></i>';
                        var $name = $('<td />').addClass(csscls('name')).html('Hints ' + $icon);
                        var $value = $('<td />').addClass(csscls('value'));

                        var $hints = new PhpDebugBar.Widgets.ListWidget({ itemRenderer: function (li, hint) {
                            li.append(hint).removeClass(csscls('list-item')).addClass(csscls('table-list-item'));
                        }});

                        $hints.set('data', stmt.hints);
                        $hints.$el
                            .removeClass(csscls('list'))
                            .addClass(csscls('table-list'))
                            .appendTo($value);

                        return $('<tr />').append($name, $value);
                    });
                }

                if (stmt.backtrace && stmt.backtrace.length) {
                    table.append(function () {
                        var icon = 'list-ul';
                        var $icon = '<i class="phpdebugbar-fa phpdebugbar-fa-' + icon + ' phpdebugbar-text-muted"></i>';
                        var $name = $('<td />').addClass(csscls('name')).html('Backtrace ' + $icon);
                        var $value = $('<td />').addClass(csscls('value'));
                        var $span = $('<span />').addClass('phpdebugbar-text-muted');

                        var $backtrace = new PhpDebugBar.Widgets.ListWidget({ itemRenderer: function (li, source) {
                            var $parts = [
                                $span.clone().text(source.index + '.'),
                                '&nbsp;',
                            ];

                            if (source.namespace) {
                                $parts.push(source.namespace + '::');
                            }

                            $parts.push(source.name);
                            $parts.push($span.clone().text(':' + source.line));

                            li.append($parts).removeClass(csscls('list-item')).addClass(csscls('table-list-item'));
                        }});

                        $backtrace.set('data', stmt.backtrace);

                        $backtrace.$el
                            .removeClass(csscls('list'))
                            .addClass(csscls('table-list'))
                            .appendTo($value);

                        return $('<tr />').append($name, $value);
                    });
                }

                if (stmt.params && !$.isEmptyObject(stmt.params)) {
                    for (var key in stmt.params) {
                        if (typeof stmt.params[key] !== 'function') {
                            table.append('<tr><td class="' + csscls('name') + '">' + key + '</td><td class="' + csscls('value') +
                                '">' + stmt.params[key] + '</td></tr>');
                        }
                    }
                }

                li.css('cursor', 'pointer').click(function () {
                    if (table.is(':visible')) {
                        table.hide();
                    } else {
                        table.show();
                    }
                });
            }});
            this.$list.$el.appendTo(this.$el);

            this.bindAttr('data', function (data) {
                this.$list.set('data', data.statements);
                this.$status.empty();
                var stmt;

                // Search for duplicate statements.
                for (var sql = {}, duplicate = 0, i = 0; i < data.statements.length; i++) {
                    if (data.statements[i].type === 'query') {
                        stmt = data.statements[i].sql;
                        if (data.statements[i].bindings && data.statements[i].bindings.length) {
                            stmt += JSON.stringify(data.statements[i].bindings);
                        }
                        if (data.statements[i].connection) {
                            stmt += '@' + data.statements[i].connection;
                        }
                        sql[stmt] = sql[stmt] || { keys: [] };
                        sql[stmt].keys.push(i);
                    }
                }
                // Add classes to all duplicate SQL statements.
                for (stmt in sql) {
                    if (sql[stmt].keys.length > 1) {
                        duplicate += sql[stmt].keys.length;

                        for (i = 0; i < sql[stmt].keys.length; i++) {
                            this.$list.$el.find('.' + csscls('list-item')).eq(sql[stmt].keys[i])
                                .addClass(csscls('sql-duplicate'))
                                .addClass(csscls('sql-duplicate-' + duplicate));
                        }
                    }
                }

                var t = $('<span />').text(data.nb_statements + " statements were executed").appendTo(this.$status);
                if (data.nb_failed_statements) {
                    t.append(", " + data.nb_failed_statements + " of which failed");
                }
                if (duplicate) {
                    t.append(", " + duplicate + " of which were duplicated");
                    t.append(", " + (data.nb_statements - duplicate) + " unique");
                }
                if (data.accumulated_duration_str) {
                    this.$status.append($('<span title="Accumulated duration" />').addClass(csscls('duration')).text(data.accumulated_duration_str));
                }
                if (data.memory_usage_str) {
                    this.$status.append($('<span title="Memory usage" />').addClass(csscls('memory')).text(data.memory_usage_str));
                }
            });
        }

    });

})(PhpDebugBar.$);
