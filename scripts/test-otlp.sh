#!/bin/bash
# Send test OTLP spans to Streamscapes for demo purposes
# Usage: ./scripts/test-otlp.sh

ENDPOINT="http://localhost:3000/api/ingest/otlp/v1/traces"

send_span() {
  local service="$1"
  local name="$2"
  local duration_ms="$3"
  local status_code="${4:-1}"  # 1=OK, 2=ERROR
  local error_msg="$5"

  local now_ns=$(($(date +%s) * 1000000000))
  local duration_ns=$((duration_ms * 1000000))
  local end_ns=$((now_ns + duration_ns))

  local status_json="{\"code\":$status_code}"
  if [ -n "$error_msg" ]; then
    status_json="{\"code\":$status_code,\"message\":\"$error_msg\"}"
  fi

  curl -s -X POST "$ENDPOINT" \
    -H 'Content-Type: application/json' \
    -d "{
      \"resourceSpans\":[{
        \"resource\":{\"attributes\":[{\"key\":\"service.name\",\"value\":{\"stringValue\":\"$service\"}}]},
        \"scopeSpans\":[{\"spans\":[{
          \"name\":\"$name\",
          \"kind\":2,
          \"startTimeUnixNano\":\"$now_ns\",
          \"endTimeUnixNano\":\"$end_ns\",
          \"status\":$status_json,
          \"attributes\":[{\"key\":\"http.response.status_code\",\"value\":{\"intValue\":200}}]
        }]}]
      }]
    }" > /dev/null
}

echo "Sending test spans to $ENDPOINT..."
echo "Make sure Streamscapes is running and you've clicked PLUG IN"
echo ""

# Wave 1: fast spans from api-gateway (high pitch, short)
for i in $(seq 1 5); do
  send_span "api-gateway" "GET /users" $((20 + RANDOM % 80))
  sleep 0.3
done

# Wave 2: medium spans from synapse (mid pitch)
for i in $(seq 1 4); do
  send_span "synapse" "POST /sync" $((200 + RANDOM % 800))
  sleep 0.4
done

# Wave 3: mix of services with some errors
send_span "daimon-agent" "process_message" 1500
sleep 0.3
send_span "api-gateway" "GET /health" 15
sleep 0.2
send_span "synapse" "send_notification" 3000 2 "connection refused"
sleep 0.3
send_span "daimon-agent" "embed_document" 5000
sleep 0.2
send_span "api-gateway" "POST /webhook" 100 2 "timeout"
sleep 0.3
send_span "synapse" "GET /rooms" 250
sleep 0.2
send_span "rag-ingester" "ingest_chunk" 800
sleep 0.3
send_span "rag-ingester" "vector_search" 150
sleep 0.2
send_span "daimon-agent" "call_llm" 8000
sleep 0.3

# Final burst — all services at once
send_span "api-gateway" "GET /status" 30 &
send_span "synapse" "PUT /state" 600 &
send_span "daimon-agent" "reply" 2000 &
send_span "rag-ingester" "reindex" 4000 2 "out of memory" &
wait

echo ""
echo "Done! You should have heard ~20 spans across 4 services."
echo "Check the error feed (bottom-right) for the 3 error spans."
