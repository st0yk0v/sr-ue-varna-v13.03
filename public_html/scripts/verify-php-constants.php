<?php
/**
 * Guard: catch undefined constants in backend PHP.
 *
 * `php -l` does NOT catch these — a typo'd constant like JSON_UNCAPED_UNICODE
 * parses fine and only throws Error at runtime, where an enclosing
 * catch(Throwable) can bury it. That is exactly how submitReport silently
 * broke for any payload containing an array field.
 *
 * Strategy: strip strings/comments/heredocs, collect ALL_CAPS barewords used in
 * constant position, and report any that are neither a PHP built-in, nor
 * defined by this codebase, nor guarded by defined(). SQL keywords are
 * allow-listed because inline SQL survives naive stripping.
 *
 * Usage: php scripts/verify-php-constants.php
 * Exit 0 = clean, 1 = suspect constant found.
 */

$files = [
    'database/api.php', 'database/sql_service.php', 'database/config.php',
    'database/veda_handlers.php', 'database/_v18_handlers.php', 'database/_v18_bridge.php',
    'database/handlers_templates_bridge.php', 'database/stream-doc.php',
    'database/proxy-doc.php', 'database/metrics.php', 'database/metrics_writer.php',
    'database/doc-stream.php', 'database/doc-stream-op.php',
];

// SQL / DDL vocabulary that appears inside query strings.
$SQL = ['SELECT','FROM','WHERE','INSERT','INTO','UPDATE','DELETE','VALUES','VALUE','SET','JOIN',
    'LEFT','RIGHT','INNER','OUTER','ORDER','GROUP','LIMIT','OFFSET','DISTINCT','COUNT','SUM','AVG',
    'MIN','MAX','LIKE','EXISTS','DUPLICATE','KEY','PRIMARY','TABLE','CREATE','ALTER','DROP','INDEX',
    'ENGINE','CHARSET','COLLATE','DEFAULT','NULL','NOT','AND','OR','AS','ON','IN','IS','BY','ASC',
    'DESC','INTERVAL','HOUR','DAY','MINUTE','SECOND','MONTH','YEAR','DATETIME','TIMESTAMP','TEXT',
    'VARCHAR','INT','DECIMAL','BOOLEAN','JSON','CALL','IGNORE','REPLACE','UNION','CASE','WHEN',
    'THEN','ELSE','END','HAVING','USING','CONSTRAINT','FOREIGN','REFERENCES','CASCADE','UNIQUE',
    'AUTO_INCREMENT','UNSIGNED','ZEROFILL','BINARY','CHAR','BLOB','ENUM','FLOAT','DOUBLE','DATE',
    'TIME','ROW','ROWS','ONLY','FIRST','LAST','NEXT','PARTITION','MODIFY','ADD','COLUMN','RENAME',
    'TINYINT','SMALLINT','MEDIUMINT','BIGINT','LONGTEXT','MEDIUMTEXT','TINYTEXT','LONGBLOB',
    'CURRENT_TIMESTAMP','SQL_CALC_FOUND_ROWS','FOUND_ROWS','NUMERIC','REAL','BIT','YEAR',
    'GEOMETRY','POINT','JSON_EXTRACT','JSON_UNQUOTE','JSON_OBJECT','JSON_ARRAY','GROUP_CONCAT',
    'TRUNCATE','LOCK','UNLOCK','TRANSACTION','COMMIT','ROLLBACK','SAVEPOINT','PROCEDURE','FUNCTION',
    'TRIGGER','VIEW','DATABASE','SCHEMA','GRANT','REVOKE','FLUSH','SHOW','DESCRIBE','EXPLAIN',
    'BETWEEN','SEPARATOR','COALESCE','IFNULL','CONCAT','SUBSTRING','TRIM','UPPER','LOWER','LENGTH',
    'ROUND','FLOOR','CEIL','ABS','NOW','CURDATE','CURTIME','DEFINER','SECURITY','INVOKER','MODE',
    'STRICT','SQL','UTF8','UTF8MB4','INNODB','MYISAM','BTREE','HASH','FULLTEXT','SPATIAL','WITH',
    'RECURSIVE','WINDOW','OVER','FILTER','EXCLUDE','GENERATED','ALWAYS','STORED','VIRTUAL','CHECK'];

// PHP language constructs that can look like barewords.
$KEYWORDS = ['ARRAY','LIST','ECHO','PRINT','CLASS','RETURN','STATIC','PUBLIC','PRIVATE',
    'PROTECTED','ELSE','ELSEIF','ENDIF','FOREACH','WHILE','FOR','BREAK','CONTINUE','SWITCH',
    'THROW','CATCH','TRY','FINALLY','USE','NEW','CLONE','INSTANCEOF','GLOBAL','ISSET','UNSET',
    'EMPTY','TRUE','FALSE','SELF','PARENT','NAMESPACE','TRAIT','INTERFACE','EXTENDS','IMPLEMENTS',
    'ABSTRACT','FINAL','CONST','VAR','MATCH','FN','YIELD','REQUIRE','INCLUDE','ONCE','EXIT','DIE',
    'HTTP','POST','GET','REMOTE_ADDR','HTTP_USER_AGENT','ORCID','SCOPUS','VEDA','COMP','PDOE'];

$allow = array_flip(array_merge($SQL, $KEYWORDS));

$defined = [];
$guarded = [];
$sources = [];
foreach ($files as $f) {
    if (!is_file($f)) continue;
    $raw = file_get_contents($f);
    $sources[$f] = $raw;
    preg_match_all("/define\s*\(\s*['\"]([A-Z0-9_]+)['\"]/", $raw, $m);
    foreach ($m[1] as $d) $defined[$d] = true;
    preg_match_all("/\bconst\s+([A-Z0-9_]+)\s*=/", $raw, $m);
    foreach ($m[1] as $d) $defined[$d] = true;
    // defined('X') means the author already treats X as optional
    preg_match_all("/defined\s*\(\s*['\"]([A-Z0-9_]+)['\"]\s*\)/", $raw, $m);
    foreach ($m[1] as $d) $guarded[$d] = true;
}

$suspects = [];
foreach ($sources as $f => $raw) {
    // Blank out non-code regions IN PLACE so line numbers stay accurate:
    // replace each stripped span with an equal number of newlines/spaces.
    $keepNewlines = function (string $m): string {
        return str_repeat("\n", substr_count($m, "\n"));
    };
    $s = preg_replace_callback('/<<<[\'"]?([A-Za-z_]\w*)[\'"]?\R.*?\R\s*\1\s*(?=[;,)])/s',
        fn($m) => $keepNewlines($m[0]), $raw);
    $s = preg_replace_callback('#/\*.*?\*/#s', fn($m) => $keepNewlines($m[0]), $s);
    $s = preg_replace('@//[^\n]*@', '', $s);
    $s = preg_replace('/#(?!\[)[^\n]*/', '', $s);
    // Quoted strings: single-line by construction after the above.
    $s = preg_replace_callback("/'(?:[^'\\\\\\n]|\\\\.)*'/", fn($m) => "''", $s);
    $s = preg_replace_callback('/"(?:[^"\\\\\\n]|\\\\.)*"/', fn($m) => '""', $s);

    $lines = explode("\n", $s);
    foreach ($lines as $i => $line) {
        // Require constant position: not preceded by $ -> :: ' " or word char,
        // and not followed by ( [ = or a quote (those indicate other syntax).
        if (!preg_match_all('/(?<![\$>:\w\'"\\\\])([A-Z][A-Z0-9_]{3,})\b(?!\s*[\(\[=:\'"])/', $line, $m)) continue;
        foreach ($m[1] as $name) {
            if (isset($allow[$name]) || isset($defined[$name]) || isset($guarded[$name])) continue;
            if (defined($name)) continue;               // real PHP built-in
            $suspects[] = ['file' => $f, 'line' => $i + 1, 'name' => $name,
                           'src' => trim($lines[$i])];
        }
    }
}

if (!$suspects) {
    echo "PHP-CONSTANTS OK: no undefined constants in " . count($sources) . " backend file(s)\n";
    exit(0);
}
echo "PHP-CONSTANTS FAIL: " . count($suspects) . " suspect constant(s)\n\n";
foreach ($suspects as $s) {
    echo "  {$s['file']}:{$s['line']}  {$s['name']}\n";
    echo "      " . substr($s['src'], 0, 120) . "\n";
}
echo "\nIf a constant is an intentional optional override, guard it with defined('X').\n";
exit(1);
