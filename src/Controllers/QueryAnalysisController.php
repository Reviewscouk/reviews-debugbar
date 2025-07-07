<?php

namespace Barryvdh\Debugbar\Controllers;

use Barryvdh\Debugbar\LaravelDebugbar;
use Illuminate\Routing\Controller;
use Illuminate\Http\Request;
use Laravel\Telescope\Telescope;





    class QueryAnalysisController  extends BaseController
    {
        protected $debugbar;

        public function analyze(Request $request)
        {
            $query = $request->all();
            
            $analysis = $this->getOpenAIAnalysis($query);
            
            return response()->json($analysis);
        }

        public function explainQuery(Request $request)
        {
            $query = $request->input('sql');
            $explain = $this->getExplainQuery($query);
            
            return response()->json($explain);
        }

        public function tableSchema(Request $request)
        {
            $tableName = $request->input('table');
            $schema = $this->getTableSchema($tableName);
            
            return response()->json($schema);
        }

        private function getSourceCode($file, $line) 
        {
            
        }

        private function getOpenAIAnalysis($query)
        {
            try {
                $openaiApiKey = config('debugbar.openai_api_key', env('CHATGPT_KEY'));
                
                if (!$openaiApiKey) {
                    return [
                        'error' => 'OpenAI API key not configured',
                        'recommendations' => []
                    ];
                }

                $prompt = "You are a patient SQL and Laravel Eloquent mentor helping a junior developer understand database performance. 

                Analyze the below query and provide an educational breakdown that teaches the developer about:
                
                1. **What this query does** - Explain in simple terms what the SQL is trying to accomplish, like explaining it to someone who's never seen SQL before
                2. **Eloquent connection** - Explain what Eloquent relationship or method likely generated this query (e.g., 'This looks like a User::where() query' or 'This is probably from a hasMany relationship')
                3. **Performance concepts** - If there are slow operations, explain what they are, why they're slow, and how to avoid them (e.g., filesort, table scans, missing indexes). Use analogies when possible.
                4. **Common mistakes** - Point out common Eloquent patterns that junior developers often use that cause this type of query
                5. **Step-by-step improvements** - Provide specific, actionable advice they can implement right now
                                        6. **Code examples** - Give them specific Eloquent code examples as an array of strings, each containing complete, copy-pasteable code blocks
                7. **Learning progression** - Suggest what they should learn next to become better at database optimization
                
                **CRITICAL: You MUST use ALL available functions for comprehensive analysis:**
                - ALWAYS use getExplainQuery() to see the execution plan
                - ALWAYS use getTableSchema() for ALL tables mentioned in the query (main table and any joined tables)
                - Use getQuerySourceCode() if you need to see the Laravel/Eloquent code that generated this query
                - DO NOT skip any of these tools - they are essential for accurate analysis
                - The more tools you use, the better your analysis will be
                
                **CODE EXAMPLES FORMAT:**
                - Return code_examples as an array of strings
                - Each string should be ONE COMPLETE code example (not individual lines)
                - Each array item should contain a full code block with proper formatting
                - DO NOT split code into separate array items per line
                - Include both Eloquent queries and migration code as separate array items
                - If the migration is for an existing table then don't use Schema::create() use Schema::table()
                - Format as: [Complete example 1, Complete example 2]
                
                Show the explain plan in your response.  
                Include a summary of the tools you ran.
                
                **Educational Focus:**
                - Start with the absolute basics - assume they know very little about SQL
                - Connect SQL operations to Eloquent methods they might be using
                - Use simple analogies (e.g., 'Think of an index like a book's table of contents')
                - Provide context about why certain operations are slow
                - Give them specific code examples they can try immediately
                - Encourage good practices like eager loading, proper indexing, etc.
                - Be encouraging and positive - learning SQL can be intimidating!
             
                \n\n" . json_encode($query);
                
                // Define available functions
                $functions = [
                    [
                        'name' => 'getExplainQuery',
                        'description' => 'Get the MySQL EXPLAIN plan for a query to analyze execution details',
                        'parameters' => [
                            'type' => 'object',
                            'properties' => [
                                'sql' => [
                                    'type' => 'string',
                                    'description' => 'The SQL query to explain'
                                ]
                            ],
                            'required' => ['sql']
                        ]
                    ],
                    [
                        'name' => 'getQuerySourceCode',
                        'description' => 'Get the file containing the Laravel/Eloquent code that generated the query',
                        'parameters' => [
                            'type' => 'object',
                            'properties' => [
                                'fileName' => [
                                    'type' => 'string',
                                    'description' => 'The file to retrieve the source code from'
                                ]
                            ],
                            'required' => ['fileName']
                        ]
                    ],
                    [
                        'name' => 'getTableSchema',
                        'description' => 'Get the schema and index information for a database table, in order to check indexes and columns',
                        'parameters' => [
                            'type' => 'object',
                            'properties' => [
                                'table' => [
                                    'type' => 'string',
                                    'description' => 'The name of the table to get schema for'
                                ]
                            ],
                            'required' => ['table']
                        ]
                    ]
                ];
                
                $messages = [
                    [
                        'role' => 'system',
                        'content' => 'You are a patient and encouraging SQL/Laravel Eloquent mentor helping junior developers learn about database performance. Your goal is to educate, not just analyze. 

                        **Your Teaching Approach:**
                        - Start with the basics - explain what the query does in simple terms
                        - Connect SQL concepts to Eloquent methods they know
                        - Explain WHY certain operations are slow (not just that they are)
                        - Provide specific, copy-pasteable code examples
                        - Use analogies and simple explanations for complex concepts
                        - Encourage questions and further learning
                        
                        **Response Structure:**
                        Return your response as a JSON object with these educational sections, in this order    :
                        {
                            "query_explanation": "Simple explanation of what this query does, and what (if anything) is wrong with it.  If source code is analysed or some conditions dont use bindings explain any security concerns (if applicable)",
                            "explain_plan_analysis":  {
                                "explain_plan": [
                                    {..row from explain plan..}
                                ],
                                "summary": "Summary of the explain plan, the features, indexes and other details, how many rows are filtered ,etc explain it in simple terms",
                            },
                            "performance_lessons": ["List of key performance concepts to learn"],
                            "improvement_steps": ["Step-by-step actions they can take"],
                            "code_examples": ["List of specific Eloquent code examples they can try. Each array item should be ONE COMPLETE code example (not individual lines). Include comments explaining what the code does and why it is needed"],
                            "common_mistakes": ["Common Eloquent patterns that cause this"],
                            "learning_progression": ["What they should learn next to improve"]
                        }

                        **MANDATORY TOOL USAGE:**
                        - You MUST call getExplainQuery() to analyze the execution plan
                        - You MUST call getTableSchema() for every table in the query to check indexes
                        - You SHOULD call getQuerySourceCode() if you need to see the source code
                        - Do not provide analysis without using these tools first
                        - The explain plan and table schema are essential for accurate recommendations
                        
                        IMPORTANT: Only include properties that have meaningful, educational content. Do NOT include properties with values like "n/a", "none", "not applicable", or similar non-useful responses. If a property cannot provide valuable learning content, omit it entirely from the JSON response.
                        Return only a valid JSON object, nothing else.'
                    ],
                    [
                        'role' => 'user',
                        'content' => $prompt
                    ]
                ];
                
                $response = $this->makeOpenAIRequest([
                    'model' => 'gpt-4o-mini',
                    'messages' => $messages,
                    'functions' => $functions,
                    'function_call' => 'auto',
                    'max_tokens' => 2000,
                    'temperature' => 0.3,
                    'response_format' => ['type' => 'json_object']
                ], $openaiApiKey);

                if (!$response['success']) {
                    return $response;
                }

                $message = $response['data']['choices'][0]['message'];
                $finalAnalysis = $message['content'];
                
                // Debug: Log initial response
                \Log::info('Initial AI response:', [
                    'has_function_call' => isset($message['function_call']),
                    'function_call' => $message['function_call'] ?? 'none',
                    'content_length' => strlen($finalAnalysis)
                ]);
                
                // Handle function calls if present - support multiple calls
                $maxFunctionCalls = 5; // Prevent infinite loops
                $functionCallCount = 0;
                $toolsUsed = [];
                
                while (isset($message['function_call']) && $functionCallCount < $maxFunctionCalls) {
                    $functionCall = $message['function_call'];
                    $functionName = $functionCall['name'];
                    $arguments = json_decode($functionCall['arguments'], true);
                    
                    // Track tools used
                    $toolsUsed[] = $functionName . '(' . json_encode($arguments) . ')';
                    
                    // Debug: Log function calls
                    \Log::info('Function call executed:', [
                        'function' => $functionName,
                        'arguments' => $arguments,
                        'call_count' => $functionCallCount + 1
                    ]);
                    
                    // Execute the function call
                    $functionResult = $this->executeFunctionCall($functionName, $arguments);
                    
                    // Add the function result to messages
                    $messages[] = $message;
                    $messages[] = [
                        'role' => 'function',
                        'name' => $functionName,
                        'content' => json_encode($functionResult)
                    ];
                    
                    // Make another API call with the function result
                    $nextResponse = $this->makeOpenAIRequest([
                        'model' => 'gpt-4o-mini',
                        'messages' => $messages,
                        'max_tokens' => 2000,
                        'temperature' => 0.3,
                        'response_format' => ['type' => 'json_object']
                    ], $openaiApiKey);
                    
                    if (!$nextResponse['success']) {
                        break;
                    }
                    
                    $message = $nextResponse['data']['choices'][0]['message'];
                    $finalAnalysis = $message['content'];
                    $functionCallCount++;
                }

                // Clean and validate the JSON response
                $finalAnalysis = $this->cleanAndValidateJSON($finalAnalysis);
                
                // Add tools used information if we have function calls
                if (!empty($toolsUsed)) {
                    $decodedAnalysis = json_decode($finalAnalysis, true);
                    if (is_array($decodedAnalysis)) {
                        $decodedAnalysis['tools_used'] = $toolsUsed;
                        $finalAnalysis = json_encode($decodedAnalysis, JSON_UNESCAPED_SLASHES);
                    }
                }
                

                
                return [
                    'analysis' => $finalAnalysis,
                    'success' => true
                ];
                
            } catch (\Exception $e) {
                return [
                    'error' => 'OpenAI API error: ' . $e->getMessage(),
                    'success' => false
                ];
            }
        }

        private function makeOpenAIRequest($data, $apiKey)
        {
            $url = 'https://api.openai.com/v1/chat/completions';
            
            $headers = [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey
            ];
            
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);
            
            if ($error) {
                return [
                    'success' => false,
                    'error' => 'cURL error: ' . $error
                ];
            }
            
            if ($httpCode !== 200) {
                return [
                    'success' => false,
                    'error' => 'HTTP error: ' . $httpCode . ' - ' . $response
                ];
            }
            
            $responseData = json_decode($response, true);
            
            if (json_last_error() !== JSON_ERROR_NONE) {
                return [
                    'success' => false,
                    'error' => 'Invalid JSON response: ' . json_last_error_msg()
                ];
            }
            
            return [
                'success' => true,
                'data' => $responseData
            ];
        }

        private function executeFunctionCall($functionName, $arguments)
        {
            try {
                switch ($functionName) {
                    case 'getExplainQuery':
                        return $this->getExplainQuery($arguments['sql']);
                        
                    case 'getTableSchema':
                        return $this->getTableSchema($arguments['table']);
                        
                    case 'getQuerySourceCode':
                        return $this->getQuerySourceCode($arguments['fileName']);
                        
                    default:
                        return ['error' => 'Unknown function: ' . $functionName];
                }
            } catch (\Exception $e) {
                return ['error' => 'Function execution error: ' . $e->getMessage()];
            }
        }

        private function getExplainQuery($query)
        {
            try {
                // Use Laravel's DB facade to get EXPLAIN results
                $explainResults = \DB::select("EXPLAIN " . $query);
                
                return [
                    'explain_plan' => $explainResults,
                    'success' => true
                ];
            } catch (\Exception $e) {
                return [
                    'error' => 'Failed to get EXPLAIN plan: ' . $e->getMessage(),
                    'success' => false
                ];
            }
        }

        private function getQuerySourceCode($fileName)
        {
            // get the source code from the file
            $sourceCode = file_get_contents($fileName);
            return $sourceCode;
        }

        private function getTableSchema($tableName)
        {
            try {
                // Get table structure using Laravel's Schema
                $columns = \Schema::getColumnListing($tableName);
                $tableInfo = [];
                
                foreach ($columns as $column) {
                    $tableInfo[$column] = [
                        'type' => \DB::connection()->getDoctrineColumn($tableName, $column)->getType()->getName(),
                        'nullable' => \DB::connection()->getDoctrineColumn($tableName, $column)->getNotnull() ? false : true,
                        'default' => \DB::connection()->getDoctrineColumn($tableName, $column)->getDefault(),
                        'length' => \DB::connection()->getDoctrineColumn($tableName, $column)->getLength(),
                    ];
                }
                
                // Get indexes
                $indexes = \DB::connection()->getDoctrineSchemaManager()->listTableIndexes($tableName);
                
                return [
                    'table_name' => $tableName,
                    'columns' => $tableInfo,
                    'indexes' => $indexes,
                    'success' => true
                ];
            } catch (\Exception $e) {
                return [
                    'error' => 'Failed to get table schema: ' . $e->getMessage(),
                    'success' => false
                ];
            }
        }

        private function cleanAndValidateJSON($jsonString)
        {
            // Just validate and return clean JSON
            $cleaned = trim($jsonString);
            
            // Try to decode to validate JSON
            $decoded = json_decode($cleaned, true);
            
            if (json_last_error() !== JSON_ERROR_NONE) {
                // If JSON is invalid, return a simple error message
                return json_encode([
                    'error' => 'Invalid JSON response from AI',
                    'raw_response' => substr($jsonString, 0, 200) . '...'
                ]);
            }
            
            // Re-encode to ensure clean JSON
            return json_encode($decoded, JSON_UNESCAPED_SLASHES);
        }
    }

