<?
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true)
{
	die();
}

return [
	'js' => 'dist/inline-duplicate.bundle.js',
	'rel' => [
		'ui.forms',
	],
	'skip_core' => true,
];
