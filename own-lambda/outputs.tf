output "invoke_url" {
  description = "URL to call the function through API Gateway"
  value       = "${aws_apigatewayv2_api.http.api_endpoint}/hello"
}
